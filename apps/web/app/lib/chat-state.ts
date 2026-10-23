/**
 * Состояние чата из журнала событий. Лента и ход работы выводятся из журнала
 * одним проходом: `fold` получает записи и отдаёт готовое состояние.
 *
 * Ответ идёт по кругам: слова, круг инструментов, снова слова. Поэтому у реплики
 * блоки в настоящем порядке, а не один склеенный текст и одна сводка хода.
 *
 * Журнал живёт в памяти страницы и нигде не хранится: правда одна, она в базе.
 * Перезагрузка журнал теряет — и это не потеря: в строке ответа лежит тот же журнал
 * кадров, и страница сводит его тем же `fold`. Поэтому здесь нет ни сверки по
 * времени, ни второго счёта.
 */
import type { ChatBlock, ChatEvent, ChatMessage, LogEntry, StoredWork, ToolCall } from '@workspace/types';
import { framesOfRaw, LIVE_ID, runningOfRaw, workOfRaw } from '@workspace/types';

/** Сколько записей журнала держим. Старое уходит: лента читается с конца. */
const LOG_LIMIT = 2000;

/** Ход одного круга: так блок хода выглядит в реплике. */
type WorkBlock = Extract<ChatBlock, { readonly type: 'work' }>;

/**
 * Ход работы агента. Идёт — живёт по часам страницы (`endedAt === null`); кончился —
 * берётся из записи ответа. Остался ради старой записи: новые пишут журнал кадров.
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
 * ответа, начало — на столько же раньше. Так старая запись показывает то же, что
 * видела страница во время хода.
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
  /** Ход идёт: журнал открыт и не закрыт. */
  readonly running: boolean;
  /** Сколько ходов агента началось: номер реплики берётся отсюда. */
  readonly turns: number;
  readonly problem: string;
  /** Последняя строка агента из потока ошибок: он один знает, что стряслось. */
  readonly note: string;
  /** Номер реплики, которая собирается сейчас. Она же — номер её записи в базе. */
  readonly liveId: string | null;
};

const emptyState = (): ChatState => ({
  messages: [],
  running: false,
  turns: 0,
  problem: '',
  note: '',
  liveId: null,
});

/** Запись ленты с сервера. Сырое поле несёт журнал хода. */
export type StoredRow = {
  readonly id: string;
  readonly role: string;
  readonly text: string;
  readonly sent_at: string;
  readonly raw?: unknown;
};

/** Готовая реплика и то, идёт ли ещё её ход по записи. */
type Settled = { readonly message: ChatMessage; readonly running: boolean };

/** Готовые реплики с сервера: они уже есть, переигрывать их нечего. */
const settledOf = (messages: readonly StoredRow[]): readonly Settled[] =>
  messages.map((message) => ({ message: messageOfStored(message), running: runningOfRaw(message.raw) }));

/**
 * Реплика из записи. Журнал есть — сводим его тем же `fold`, что и живые события.
 * Журнала нет — запись старая: ход сводкой и текст после него.
 */
const messageOfStored = (row: StoredRow): ChatMessage => {
  const id = `db-${row.id}`;
  const role = roleOf(row.role);
  const frames = framesOfRaw(row.raw);
  if (role === 'user') return { id, role, text: row.text, at: row.sent_at, blocks: blocksOf(row.text) };
  if (frames === undefined) return oldMessageOf(id, row);
  const folded = fold([{ at: row.sent_at, event: { kind: 'started', messageId: id } }, ...frames]);
  const last = folded.messages.at(-1);
  // Журнал испорчен целиком — реплика остаётся хотя бы текстом: пустой ленты не бывает.
  if (last === undefined) return { id, role, text: row.text, at: row.sent_at, blocks: blocksOf(row.text) };
  if (last.blocks.length > 0) return { ...last, id };
  if (row.text === '') return { ...last, id };
  return { id, role, text: row.text, at: row.sent_at, blocks: blocksOf(row.text) };
};

/** Старая запись: ход сводкой, текст после него. Новые записи так не выглядят. */
const oldMessageOf = (id: string, row: StoredRow): ChatMessage => {
  const base: ChatMessage = { id, role: 'assistant', text: row.text, at: row.sent_at, blocks: blocksOf(row.text) };
  const work = workOfRaw(row.raw);
  if (work === undefined) return base;
  const shown = workOfStored(work, row.sent_at);
  // Ход сводки становится блоком хода: у старой записи круг один.
  const block: WorkBlock = {
    type: 'work',
    calls: shown.calls,
    thoughts: shown.thoughts,
    thinking: shown.thinking,
    startedAt: shown.startedAt,
    endedAt: shown.endedAt,
  };
  return { ...base, blocks: [block, ...base.blocks] };
};

const roleOf = (role: string): ChatMessage['role'] => {
  if (role === 'user') return 'user';
  return 'assistant';
};

const blocksOf = (text: string): readonly ChatBlock[] => {
  if (text === '') return [];
  return [{ type: 'text', text }];
};

/**
 * Вызовы хода: полный список записи, а у старых записей — одни имена. Замысла у старой
 * записи нет, поэтому замысел — само имя инструмента.
 */
const callsOfWork = (stored: StoredWork): readonly ToolCall[] => {
  const calls = stored.calls;
  if (calls !== undefined && calls.length > 0) return calls;
  const names = stored.names;
  if (names === undefined) return [];
  return names.map((name) => ({ name, intent: name }));
};

/** Текст реплики — склейка текстовых блоков: целое всегда вывод из частей. */
const textOfBlocks = (blocks: readonly ChatBlock[]): string =>
  blocks
    .flatMap((block) => {
      if (block.type !== 'text') return [];
      return [block.text];
    })
    .join('');

/** Последний круг закрывается: слова начали новый. Другого круга нет — закрывать нечего. */
const closeLastWork = (blocks: readonly ChatBlock[], at: string): readonly ChatBlock[] => {
  const last = blocks.at(-1);
  if (last === undefined) return blocks;
  if (last.type !== 'work') return blocks;
  if (last.endedAt !== null) return blocks;
  return [...blocks.slice(0, -1), { ...last, thinking: false, endedAt: at }];
};

/** Кусок текста: прошлый круг закрыт, текст дописывается в свой блок или заводит новый. */
const withChunk = (blocks: readonly ChatBlock[], at: string, text: string): readonly ChatBlock[] => {
  const closed = closeLastWork(blocks, at);
  const last = closed.at(-1);
  if (last === undefined) return [...closed, { type: 'text', text }];
  if (last.type !== 'text') return [...closed, { type: 'text', text }];
  return [...closed.slice(0, -1), { type: 'text', text: last.text + text }];
};

/**
 * Кадр работы. Список приходит целиком: он заменяет вызовы своего круга. Пустой
 * список без круга блока не заводит — это ещё не работа, а только признак мысли.
 */
const withLive = (
  blocks: readonly ChatBlock[],
  at: string,
  calls: readonly ToolCall[],
  thinking: boolean,
): readonly ChatBlock[] => {
  const last = blocks.at(-1);
  if (calls.length === 0) {
    if (last === undefined) return blocks;
    if (last.type !== 'work') return blocks;
    return [...blocks.slice(0, -1), { ...last, thinking }];
  }
  if (last !== undefined && last.type === 'work' && last.endedAt === null) {
    return [...blocks.slice(0, -1), { ...last, calls, thinking }];
  }
  return [...blocks, { type: 'work', calls, thoughts: 0, thinking, startedAt: at, endedAt: null }];
};

/** Мысль: своя у круга, а до первого вызова — у нового круга с одними мыслями. */
const withThought = (blocks: readonly ChatBlock[], at: string): readonly ChatBlock[] => {
  const last = blocks.at(-1);
  if (last === undefined || last.type !== 'work') {
    return [...blocks, { type: 'work', calls: [], thoughts: 1, thinking: false, startedAt: at, endedAt: null }];
  }
  return [...blocks.slice(0, -1), { ...last, thoughts: last.thoughts + 1 }];
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

/** Последняя реплика — та, что собирается. Её и правит событие ответа. */
const editLast = (state: ChatState, at: string, edit: (message: ChatMessage) => ChatMessage): ChatState => {
  const id = liveIdOf(state.turns, state.liveId);
  const last = state.messages.at(-1);
  if (last === undefined || last.id !== id) {
    // Реплику завели, не дождавшись кадра `started` (страница подписалась посреди хода):
    // держим её за свой номер и помним, что собираем именно её.
    return { ...state, messages: [...state.messages, edit(liveMessage(state.turns, at, state.liveId))], liveId: id };
  }
  return { ...state, messages: [...state.messages.slice(0, -1), edit(last)] };
};

/** Блоки реплики заменяются целиком: текст — всегда вывод из них. */
const withBlocks = (message: ChatMessage, blocks: readonly ChatBlock[]): ChatMessage => ({
  ...message,
  blocks,
  text: textOfBlocks(blocks),
});

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

/** Последний круг закрыт: ход кончился или сорвался. */
const closeLastCircle = (state: ChatState, at: string): ChatState =>
  editLast(state, at, (message) => withBlocks(message, closeLastWork(message.blocks, at)));

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
      running: false,
      problem: '',
      note: '',
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
    // Реплика агента заводится сразу с началом хода: блоки работы стоят на ней,
    // а не на вопросе человека. Номер записи приходит этим же кадром, поэтому
    // страница и база говорят об одном ходе с первой секунды.
    const turns = state.turns + 1;
    return {
      ...state,
      messages: [...state.messages, liveMessage(turns, entry.at, event.messageId)],
      running: true,
      problem: '',
      turns,
      liveId: liveIdOf(turns, event.messageId),
    };
  }
  if (event.kind === 'chunk') {
    const text = event.text;
    return editLast(state, entry.at, (message) => withBlocks(message, withChunk(message.blocks, entry.at, text)));
  }
  if (event.kind === 'live') {
    return editLast(state, entry.at, (message) =>
      withBlocks(message, withLive(message.blocks, entry.at, event.calls, event.thinking)),
    );
  }
  if (event.kind === 'thought') {
    return editLast(state, entry.at, (message) => withBlocks(message, withThought(message.blocks, entry.at)));
  }
  if (event.kind === 'log') {
    return { ...state, note: event.text };
  }
  if (event.kind === 'failed') {
    return { ...closeLastCircle(state, entry.at), running: false, problem: event.reason };
  }
  if (event.kind === 'ended') {
    // Реплика записана: берёт номер записи. Придёт лента — вытеснит её по номеру.
    return { ...closeLastCircle(withStoredId(state, event.messageId), entry.at), running: false };
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
  const settled = settledOf(messages).flatMap((pair) => {
    if (hiddenWhileAssembling(pair, assembling)) return [];
    return [pair.message];
  });
  const storedIds = new Set(settled.map((message) => message.id.slice('db-'.length)));
  const gathered = replayed.messages.filter((message) => !storedIds.has(message.id));
  return { ...replayed, messages: [...settled, ...gathered] };
};

/** Идущая запись ленты, пока ход собирается: собираемая реплика свежее её. */
const hiddenWhileAssembling = (settled: Settled, assembling: boolean): boolean => {
  if (!assembling) return false;
  return settled.running;
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
