/**
 * Состояние чата из журнала событий. Лента и ход работы выводятся из журнала
 * одним проходом: `fold` получает записи и отдаёт готовое состояние.
 *
 * Журнал живёт в памяти страницы и нигде не хранится: правда одна, она в базе.
 * Перезагрузка журнал теряет — и это не потеря: лента приходит из базы целиком,
 * а ход, который идёт сейчас, читается оттуда же (запись хода заводится с его
 * началом). Поэтому здесь нет ни сверки по времени, ни второго счёта.
 */
import type { ChatBlock, ChatEvent, ChatMessage, LogEntry, StoredWork, ToolCall } from '@workspace/types';
import { LIVE_ID, workOfRaw } from '@workspace/types';

/** Сколько записей журнала держим. Старое уходит: лента читается с конца. */
const LOG_LIMIT = 2000;

/**
 * Ход работы агента. Идёт — живёт по часам страницы (`endedAt === null`); кончился —
 * берётся из записи ответа (`stored`), поэтому одинакова до и после обновления.
 */
export type Work = {
  readonly calls: readonly ToolCall[];
  readonly thinking: boolean;
  readonly thoughts: number;
  readonly startedAt: string;
  /** Ход кончился: время конца. Идёт — конца нет, и время считается по часам. */
  readonly endedAt: string | null;
};

/**
 * Ход работы из записи. Часы строим от записанной длительности: конец — время
 * ответа, начало — на столько же раньше. Тогда строка показывает то же, что видела
 * страница во время хода.
 */
export const workOfStored = (stored: StoredWork, at: string): Work => {
  const calls = callsOfWork(stored);
  // Ход ещё идёт: запись заведена в начале хода, и конца у неё нет. Часы идут от
  // времени записи, строка показывает то же, что видел человек до перезагрузки.
  if (stored.endedAt === null) {
    return { calls, thinking: stored.thinking === true, thoughts: stored.thoughts, startedAt: at, endedAt: null };
  }
  return {
    calls,
    thinking: false,
    thoughts: stored.thoughts,
    // Часы строим от записанной длительности: конец — время ответа, начало — раньше.
    startedAt: new Date(Date.parse(at) - stored.seconds * 1000).toISOString(),
    endedAt: at,
  };
};

/** Состояние чата. Всё выводится из журнала, ничего не хранится отдельно. */
export type ChatState = {
  readonly messages: readonly ChatMessage[];
  readonly work: Work | null;
  /** Сколько ходов агента началось: номер реплики берётся отсюда. */
  readonly turns: number;
  readonly problem: string;
  /** Номер реплики, которая собирается сейчас. Она же — номер её записи в базе. */
  readonly liveId: string | null;
};

export const emptyState = (): ChatState => ({ messages: [], work: null, turns: 0, problem: '', liveId: null });

/** Запись ленты с сервера. Сырое поле несёт ход работы ответа. */
export type StoredRow = {
  readonly id: string;
  readonly role: string;
  readonly text: string;
  readonly sent_at: string;
  readonly raw?: unknown;
};

/** Готовые реплики с сервера: они уже есть, переигрывать их нечего. */
export const settledOf = (messages: readonly StoredRow[]): readonly ChatMessage[] =>
  messages.map((message) => {
    // Ход работы есть в записи — реплика несёт его с собой; нет — реплика без строки.
    const work = workOfRaw(message.raw);
    const row = {
      id: `db-${message.id}`,
      role: roleOf(message.role),
      text: message.text,
      at: message.sent_at,
      blocks: blocksOf(message.text),
    };
    if (work === undefined) return row;
    return { ...row, storedWork: work };
  });

const roleOf = (role: string): ChatMessage['role'] => {
  if (role === 'user') return 'user';
  return 'assistant';
};

const blocksOf = (text: string): readonly ChatBlock[] => {
  if (text === '') return [];
  return [{ type: 'text', text }];
};

/** Вызовы хода: полный список записи, а у старых записей — одни имена. */
const callsOfWork = (stored: StoredWork): readonly ToolCall[] => {
  if (stored.calls !== undefined) return stored.calls;
  return stored.names.map((name) => ({ name, intent: name }));
};

/**
 * Номер собираемой реплики. Номер записи известен с первого кадра, поэтому он и есть
 * её номер; пока номера нет, реплика держится за номер хода.
 */
const liveIdOf = (turns: number, id: string | null | undefined): string => {
  if (typeof id === 'string') return id;
  return `${LIVE_ID}-${turns}`;
};

/**
 * Реплика, которая собирается сейчас. Номер её записи известен с первого кадра, поэтому
 * она сразу носит номер базы; без него держим свой — по номеру хода.
 */
const liveMessage = (turns: number, at: string, id: string | null | undefined): ChatMessage => ({
  id: liveIdOf(turns, id),
  role: 'assistant',
  text: '',
  at,
  blocks: [],
});

/** Ход работы начался: список пуст, часы пошли. */
const startedWork = (at: string): Work => ({
  calls: [],
  thinking: false,
  thoughts: 0,
  startedAt: at,
  endedAt: null,
});

/** Последняя реплика — та, что собирается. Её и правит событие ответа. */
const withLive = (state: ChatState, at: string, edit: (message: ChatMessage) => ChatMessage): ChatState => {
  const id = liveIdOf(state.turns, state.liveId);
  const last = state.messages.at(-1);
  if (last === undefined || last.id !== id) {
    // Реплику завели, не дождавшись кадра `started` (страница подписалась посреди хода):
    // держим её за свой номер и помним, что собираем именно её.
    return { ...state, messages: [...state.messages, edit(liveMessage(state.turns, at, state.liveId))], liveId: id };
  }
  return { ...state, messages: [...state.messages.slice(0, -1), edit(last)] };
};

/** Текст реплики собирается из кусков: целое всегда вывод из частей. */
const withText = (message: ChatMessage, text: string): ChatMessage => {
  const block = message.blocks.at(-1);
  if (block === undefined || block.type !== 'text') {
    return { ...message, text: message.text + text, blocks: [...message.blocks, { type: 'text', text }] };
  }
  return {
    ...message,
    text: message.text + text,
    blocks: [...message.blocks.slice(0, -1), { type: 'text', text: block.text + text }],
  };
};

/** Собранная реплика получает номер своей записи: так её опознаёт пришедшая лента. */
const withStoredId = (state: ChatState, messageId: string | undefined): ChatState => {
  if (messageId === undefined || state.liveId === null) return state;
  return {
    ...state,
    messages: state.messages.map((message) => {
      if (message.id !== state.liveId) return message;
      return { ...message, id: messageId };
    }),
    liveId: messageId,
  };
};

/** Ход закончился: часы остановлены. Идущего хода нет — и останавливать нечего. */
const endedWork = (state: ChatState, at: string): ChatState => {
  if (state.work === null) return state;
  return { ...state, work: { ...state.work, thinking: false, endedAt: at } };
};

/** Один шаг переигрывания: запись журнала превращается в состояние. */
const step = (state: ChatState, entry: LogEntry): ChatState => {
  const event = entry.event;
  if (event.kind === 'ask') {
    // Вопрос человека открывает ход: прошлый ход закрыт, ошибка снята.
    return {
      ...state,
      messages: [
        ...state.messages,
        { id: event.id, role: 'user', text: event.text, at: event.at, blocks: blocksOf(event.text) },
      ],
      work: null,
      problem: '',
      liveId: null,
    };
  }
  if (event.kind === 'asked') {
    // Запись сделана: вопрос меняет временный номер на номер своей записи.
    const messages = state.messages.map((message) => {
      if (message.id !== event.id) return message;
      return { ...message, id: event.messageId };
    });
    return { ...state, messages };
  }
  if (event.kind === 'started') {
    // Реплика агента заводится сразу с началом хода: строка работы стоит на ней,
    // а не на вопросе человека. Номер записи приходит этим же кадром, поэтому
    // страница и база говорят об одном ходе с первой секунды.
    const turns = state.turns + 1;
    return {
      ...state,
      messages: [...state.messages, liveMessage(turns, entry.at, event.messageId)],
      work: startedWork(entry.at),
      problem: '',
      turns,
      liveId: liveIdOf(turns, event.messageId),
    };
  }
  if (event.kind === 'live') {
    if (state.work === null) return state;
    const work = { ...state.work, calls: event.calls, thinking: event.thinking };
    return { ...state, work };
  }
  if (event.kind === 'thought') {
    if (state.work === null) return state;
    return { ...state, work: { ...state.work, thoughts: state.work.thoughts + 1 } };
  }
  if (event.kind === 'chunk') {
    return withLive(state, entry.at, (message) => withText(message, event.text));
  }
  if (event.kind === 'failed') {
    return { ...endedWork(state, entry.at), problem: event.reason };
  }
  if (event.kind === 'ended') {
    // Реплика записана: берёт номер записи. Придёт лента — вытеснит её по номеру.
    return endedWork(withStoredId(state, event.messageId), entry.at);
  }
  return state;
};

/** Переигрывание журнала: лента и ход работы выводятся одним проходом. */
export const fold = (entries: readonly LogEntry[]): ChatState =>
  entries.reduce<ChatState>((state, entry) => step(state, entry), emptyState());

/**
 * Свежая лента: переигрывание журнала поверх готовых реплик с сервера.
 *
 * Реплика из журнала и запись на сервере — одна и та же реплика: первая уступает
 * второй по номеру записи, который приходит первым кадром хода. Идущий ход — особый
 * случай: собранная из кусков реплика свежее записи (куски в записи ещё не легли),
 * поэтому пока ход собирается, идущую запись прячем и показываем реплику.
 */
export const stateOf = (messages: readonly StoredRow[], entries: readonly LogEntry[]): ChatState => {
  const replayed = fold(entries);
  const assembling = replayed.liveId !== null;
  const settled = settledOf(messages).filter((message) => !hiddenWhileAssembling(message, assembling));
  const storedIds = new Set(settled.map((message) => message.id.slice('db-'.length)));
  const gathered = replayed.messages.filter((message) => !storedIds.has(message.id));
  return { ...replayed, messages: [...settled, ...gathered] };
};

/** Идущая запись ленты, пока ход собирается: собираемая реплика свежее её. */
const hiddenWhileAssembling = (message: ChatMessage, assembling: boolean): boolean => {
  if (!assembling) return false;
  return message.storedWork?.endedAt === null;
};

/** Запись журнала добавляется в конец. Старые записи уходят — лента читается с конца. */
export const appendEntry = (entries: readonly LogEntry[], event: ChatEvent, at: string): readonly LogEntry[] => {
  const grown = [...entries, { at, event }];
  if (grown.length <= LOG_LIMIT) return grown;
  return grown.slice(grown.length - LOG_LIMIT);
};

/** Момент для записи: часы страницы, а не сервера. Свежее всегда последнее. */
export const nowIso = (): string => new Date().toISOString();

export type { ChatBlock, ChatEvent, ChatMessage, LogEntry, ToolCall };
