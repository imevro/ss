/**
 * Состояние чата из журнала событий. Лента и ход работы выводятся из журнала
 * одним проходом: `fold` получает записи и отдаёт готовое состояние.
 *
 * Переигрывание — единственный способ собрать состояние. Страница не хранит
 * разметку сама, поэтому восстановленный чат не отличается от свежего: тот же
 * проход, те же события. Исключение одно — пришедшие с сервера реплики: их в
 * журнале нет, они уже готовы и кладутся в начало.
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
export const workOfStored = (stored: StoredWork, at: string): Work => ({
  calls: stored.names.map((name) => ({ name, intent: name })),
  thinking: false,
  thoughts: stored.thoughts,
  startedAt: new Date(Date.parse(at) - stored.seconds * 1000).toISOString(),
  endedAt: at,
});

/** Состояние чата. Всё выводится из журнала, ничего не хранится отдельно. */
export type ChatState = {
  readonly messages: readonly ChatMessage[];
  readonly work: Work | null;
  /** Сколько ходов агента началось: номер реплики берётся отсюда. */
  readonly turns: number;
  readonly problem: string;
};

export const emptyState = (): ChatState => ({ messages: [], work: null, turns: 0, problem: '' });

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

/** Реплика, которая собирается сейчас: номер хода делает её адрес постоянным. */
const liveMessage = (turns: number, at: string): ChatMessage => ({
  id: `${LIVE_ID}-${turns}`,
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
  const last = state.messages.at(-1);
  if (last === undefined || last.id !== `${LIVE_ID}-${state.turns}`) {
    return { ...state, messages: [...state.messages, edit(liveMessage(state.turns, at))] };
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
  if (messageId === undefined) return state;
  const last = state.messages.at(-1);
  if (last === undefined) return state;
  if (last.id.slice(0, LIVE_ID.length) !== LIVE_ID) return state;
  return { ...state, messages: [...state.messages.slice(0, -1), { ...last, id: messageId }] };
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
    // а не на вопросе человека. Куски наполняют её же.
    const turns = state.turns + 1;
    return {
      ...state,
      messages: [...state.messages, liveMessage(turns, entry.at)],
      work: startedWork(entry.at),
      problem: '',
      turns,
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

/** Момент записи, если время читается. Нечитаемое — «не знаем», тогда реплика остаётся. */
const momentOf = (at: string): number | undefined => {
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return;
  return parsed;
};

/** Реплика, собранная из кусков, помнит время своего начала. Готовая — нет. */
const startOfLive = (message: ChatMessage): number | undefined => {
  if (message.id.slice(0, LIVE_ID.length) !== LIVE_ID) return;
  return momentOf(message.at);
};

/** Самый поздний записанный ответ: ход, начавшийся раньше него, сервер уже записал. */
const lastAnswerAt = (stored: readonly ChatMessage[]): number | undefined => {
  const moments = stored
    .filter((message) => message.role === 'assistant')
    .map((message) => momentOf(message.at))
    .filter((moment) => moment !== undefined);
  if (moments.length === 0) return;
  return Math.max(...moments);
};

/**
 * Реплики журнала, которые сервер уже записал, а связка по номеру записи не дошла:
 * страница закрылась посреди хода или ход шёл в другом чате. Номера тогда у реплик
 * временные, и по номеру их с записью не свести — сводим по времени: ход, начавшийся
 * раньше последнего записанного ответа, в ленте уже есть. Без этой сверки старый ход
 * показывался бы в конце ленты второй раз. Вопрос уходит вместе со своим ответом.
 */
const supersededIds = (messages: readonly ChatMessage[], lastAt: number | undefined): readonly string[] => {
  if (lastAt === undefined) return [];
  return messages.flatMap((message, index) => {
    const here = startOfLive(message);
    if (here !== undefined) {
      if (here > lastAt) return [];
      return [message.id];
    }
    const next = messages[index + 1];
    if (next === undefined) return [];
    const start = startOfLive(next);
    if (start === undefined) return [];
    if (start > lastAt) return [];
    return [message.id, next.id];
  });
};

/**
 * Свежая лента: переигрывание журнала поверх готовых реплик с сервера.
 *
 * Реплика из журнала и запись на сервере — одна и та же реплика: первая уступает
 * второй, иначе она показалась бы дважды. Уступает двумя способами: по номеру
 * записи, когда связка дошла (`asked` и `ended` несут номер), и по времени, когда
 * не дошла. Счёт по порядку не годится: журнал не всегда помнит всю ленту, и
 * счёт сбивается — тогда свежий вопрос пропадал бы с экрана.
 */
export const stateOf = (messages: readonly StoredRow[], entries: readonly LogEntry[]): ChatState => {
  const replayed = fold(entries);
  const stored = settledOf(messages);
  const storedIds = new Set(stored.map((message) => message.id.slice('db-'.length)));
  const superseded = new Set(supersededIds(replayed.messages, lastAnswerAt(stored)));
  const gathered = replayed.messages.flatMap((message) => {
    const id = message.id;
    if (storedIds.has(id)) return [];
    if (superseded.has(id)) return [];
    return [message];
  });
  return { ...replayed, messages: [...stored, ...gathered] };
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
