/**
 * События чата и порядок их чтения. Один список видов на весь проект: комната
 * передаёт событие тем же именем, каким его зовёт мост агента, а страница
 * собирает ленту переигрыванием.
 *
 * Событие — это факт про чат, а не про экран: «человек написал», «агент
 * позвал инструмент», «блок ответа кончился». Лента и ход работы выводятся из них.
 */

/** Позванный инструмент: имя и замысел, ради которого его позвали. */
export type ToolCall = { readonly name: string; readonly intent: string };

/**
 * Блок ответа. Ответ идёт по кругам: слова, круг инструментов, снова слова. Блок —
 * один круг в том порядке, в каком он был; поэтому текст агента не склеивается.
 */
export type ChatBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'work';
      readonly calls: readonly ToolCall[];
      readonly thoughts: number;
      readonly thinking: boolean;
      readonly startedAt: string;
      /** Ход этого круга кончился: время конца. Идёт — конца нет. */
      readonly endedAt: string | null;
    };

/** Кто говорит. В ленте только эти двое. */
export type ChatRole = 'user' | 'assistant';

/**
 * Готовый ход работы. **Старая запись**: новые строки пишут журнал кадров, и вид
 * этот остался только для чтения того, что записано до переезда.
 */
export type StoredWork = {
  readonly seconds: number;
  /**
   * Имена позванных инструментов у старых записей: у новых тот же список лежит в
   * `calls`, и второй раз он не пишется.
   */
  readonly names?: readonly string[];
  readonly thoughts: number;
  /** Полный список хода: имя и замысел. Идущий ход несёт его, записанный — тоже. */
  readonly calls?: readonly ToolCall[];
  /** Идёт ли ещё ход. Записанный и законченный — false. */
  readonly thinking?: boolean;
  /** Конец хода. У идущего хода конца нет — по нему видно, что ход ещё идёт. */
  readonly endedAt?: string | null;
};

/** Реплика ленты. Собирается переигрыванием, а не приходит с сервера целиком. */
export type ChatMessage = {
  readonly id: string;
  readonly role: ChatRole;
  /** Текст реплики: склейка текстовых блоков. Целое всегда вывод из частей. */
  readonly text: string;
  readonly at: string;
  readonly blocks: readonly ChatBlock[];
};

/** Номер реплики, которая собирается сейчас: у идущего ответа номер один и тот же. */
export const LIVE_ID = 'live';

/**
 * Событие чата. Из комнаты приходят `started`, `chunk`, `live`, `thought`,
 * `log`, `failed` и `done` (ложится в `ended`); `ask` и `asked` ставит сама страница.
 */
export type ChatEvent =
  | { readonly kind: 'ask'; readonly id: string; readonly text: string; readonly at: string }
  | { readonly kind: 'asked'; readonly id: string; readonly messageId: string }
  | { readonly kind: 'started'; readonly messageId?: string }
  | { readonly kind: 'chunk'; readonly text: string }
  | { readonly kind: 'live'; readonly calls: readonly ToolCall[]; readonly thinking: boolean }
  | { readonly kind: 'thought' }
  | { readonly kind: 'log'; readonly text: string }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'ended'; readonly messageId?: string };

/** Запись журнала: единственное, что хранится. Состояние из неё выводится. */
export type LogEntry = { readonly at: string; readonly event: ChatEvent };

/** Список вызовов: испорченный вызов пропускается, целые берутся. */
const callsOf = (value: readonly unknown[]): readonly ToolCall[] =>
  value.flatMap((call) => {
    if (typeof call !== 'object' || call === null) return [];
    const named = call as Record<string, unknown>;
    if (typeof named.name !== 'string' || typeof named.intent !== 'string') return [];
    return [{ name: named.name, intent: named.intent }];
  });

/** Список вызовов из поля: поля нет или он чужой — пустой список. */
const callsOfField = (value: unknown): readonly ToolCall[] => {
  if (!Array.isArray(value)) return [];
  return callsOf(value);
};

/** Имена из поля: поля нет или оно чужое — имени нет; испорченное имя пропускается. */
const namesOfField = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return;
  return value.flatMap((name) => {
    if (typeof name !== 'string') return [];
    return [name];
  });
};

/**
 * Конец хода из поля: время — ход закрыт; поле есть, а времени нет — ход идёт;
 * поля нет вовсе — запись старая, её ход считаем закрытым.
 */
const endedAtOfField = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
};

/**
 * Ход работы из записи (старая запись). Сырое поле приходит из базы строкой с
 * байтами JSON — разбираем её; чужой вид не берём, ответ покажется без строки.
 */
export const workOfRaw = (raw: unknown): StoredWork | undefined => {
  const parsed = parsedRaw(raw);
  if (typeof parsed !== 'object' || parsed === null) return;
  const work: unknown = (parsed as Record<string, unknown>).work;
  if (typeof work !== 'object' || work === null) return;
  const fields = work as Record<string, unknown>;
  if (typeof fields.seconds !== 'number') return;
  if (typeof fields.thoughts !== 'number') return;
  const calls = callsOfField(fields.calls);
  const base: StoredWork = {
    seconds: fields.seconds,
    names: namesOfField(fields.names),
    thoughts: fields.thoughts,
    calls,
    thinking: fields.thinking === true,
  };
  const endedAt = endedAtOfField(fields.endedAt);
  if (endedAt === undefined) return base;
  return { ...base, endedAt };
};

/** Событие кадра. Чужой вид кадра — не кадр: такой пропускаем. */
const eventOfFrame = (value: unknown): ChatEvent | undefined => {
  if (typeof value !== 'object' || value === null) return;
  const event = value as Record<string, unknown>;
  if (event.kind === 'thought') return { kind: 'thought' };
  if (event.kind === 'ended') return endedOfField(event.messageId);
  if (event.kind === 'failed') {
    if (typeof event.reason !== 'string') return;
    return { kind: 'failed', reason: event.reason };
  }
  if (event.kind === 'chunk') {
    if (typeof event.text !== 'string') return;
    return { kind: 'chunk', text: event.text };
  }
  if (event.kind === 'live') {
    const calls = liveCallsOf(event.calls);
    if (calls === undefined) return;
    return { kind: 'live', calls, thinking: event.thinking === true };
  }
};

/** Конец хода из кадра: номер записи есть — берём его; чужая подстановка не нужна. */
const endedOfField = (value: unknown): ChatEvent => {
  if (typeof value !== 'string') return { kind: 'ended' };
  return { kind: 'ended', messageId: value };
};

/** Список вызовов живого кадра: список не пришёл — кадр испорчен, а не пуст. */
const liveCallsOf = (value: unknown): readonly ToolCall[] | undefined => {
  if (!Array.isArray(value)) return;
  return callsOf(value);
};

/** Один кадр журнала: время и событие. Испорченный кадр пропускается. */
const frameOf = (entry: unknown): LogEntry | undefined => {
  if (typeof entry !== 'object' || entry === null) return;
  const fields = entry as Record<string, unknown>;
  if (typeof fields.at !== 'string') return;
  const event = eventOfFrame(fields.event);
  if (event === undefined) return;
  return { at: fields.at, event };
};

/** Журнал хода, записанный в строке ответа. Нет журнала — запись старая. */
export const framesOfRaw = (raw: unknown): readonly LogEntry[] | undefined => {
  const parsed = parsedRaw(raw);
  if (typeof parsed !== 'object' || parsed === null) return;
  const frames: unknown = (parsed as Record<string, unknown>).frames;
  if (!Array.isArray(frames)) return;
  return frames.flatMap((entry) => {
    const frame = frameOf(entry);
    if (frame === undefined) return [];
    return [frame];
  });
};

/** Ход ещё идёт: журнал есть, а конца в нём нет. Старая запись — по концу хода. */
export const runningOfRaw = (raw: unknown): boolean => {
  const frames = framesOfRaw(raw);
  if (frames === undefined) return workOfRaw(raw)?.endedAt === null;
  const last = frames.at(-1);
  // Журнал заведён, кадров ещё нет: ход открыли и он идёт.
  if (last === undefined) return true;
  if (last.event.kind === 'ended') return false;
  if (last.event.kind === 'failed') return false;
  return true;
};

/** Сырое поле из базы: строка с байтами JSON разбирается, готовое значение идёт как есть. */
const parsedRaw = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw;
  return parseJson(raw);
};

/** Разбор байтов: хранилище может быть испорчено — это не беда страницы. */
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
