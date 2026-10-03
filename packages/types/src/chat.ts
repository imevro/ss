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

/** Блок ответа: мысль агента или его слова. */
export type ChatBlock = { readonly type: 'text'; readonly text: string };

/** Кто говорит. В ленте только эти двое. */
export type ChatRole = 'user' | 'assistant';

/**
 * Готовый ход работы: сколько шёл, что позвал, сколько думал. Лежит в записи
 * ответа, поэтому приходит с сервера вместе с лентой — страница показывает его
 * с первого кадра, без пересчёта в браузере.
 */
export type StoredWork = {
  readonly seconds: number;
  /** Имена позванных инструментов по порядку вызова: число считает показывающий. */
  readonly names: readonly string[];
  readonly thoughts: number;
};

/** Реплика ленты. Собирается переигрыванием, а не приходит с сервера целиком. */
export type ChatMessage = {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly at: string;
  readonly blocks: readonly ChatBlock[];
  /** Ход работы этого ответа. Есть у записанного ответа, нет у идущего. */
  readonly storedWork?: StoredWork;
};

/** Номер реплики, которая собирается сейчас: у идущего ответа номер один и тот же. */
export const LIVE_ID = 'live';

/** Событие чата. Первые семь приходят из комнаты, последние два ставит страница. */
export type ChatEvent =
  | { readonly kind: 'ask'; readonly id: string; readonly text: string; readonly at: string }
  | { readonly kind: 'asked'; readonly id: string; readonly messageId: string }
  | { readonly kind: 'started' }
  | { readonly kind: 'chunk'; readonly text: string }
  | { readonly kind: 'live'; readonly calls: readonly ToolCall[]; readonly thinking: boolean }
  | { readonly kind: 'thought' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'ended'; readonly messageId?: string };

/** Запись журнала: единственное, что хранится. Состояние из неё выводится. */
export type LogEntry = { readonly at: string; readonly event: ChatEvent };

/** Ключ хранилища: журнал чата. Один на чат, как ключ у сессии агента. */
export const logKey = (conversationId: string): string => `ss.chat.${conversationId}`;

/**
 * Разбор записи журнала. Хранилище — чужие байты: испорченная запись пропускается,
 * а не ломает ленту. Пустая строка вместо разбора тоже годится.
 */
const EVENT_KINDS: Readonly<Record<string, string>> = {
  ask: 'ask',
  started: 'started',
  chunk: 'chunk',
  live: 'live',
  thought: 'thought',
  failed: 'failed',
  asked: 'asked',
  ended: 'ended',
};

const isKind = (value: unknown): value is ChatEvent['kind'] => {
  if (typeof value !== 'string') return false;
  return EVENT_KINDS[value] !== undefined;
};

/**
 * Чтение события из хранилища по видам: у каждого вида свой разбор своих полей.
 * Разборы — таблица, а не лестница ветвей: новый вид добавляется одной строкой.
 */
const READERS: Readonly<Record<string, (frame: Record<string, unknown>) => ChatEvent | undefined>> = {
  ask: (frame) => {
    if (typeof frame.id !== 'string' || typeof frame.text !== 'string' || typeof frame.at !== 'string') return;
    return { kind: 'ask', id: frame.id, text: frame.text, at: frame.at };
  },
  asked: (frame) => {
    if (typeof frame.id !== 'string' || typeof frame.messageId !== 'string') return;
    return { kind: 'asked', id: frame.id, messageId: frame.messageId };
  },
  chunk: (frame) => {
    if (typeof frame.text !== 'string') return;
    return { kind: 'chunk', text: frame.text };
  },
  live: (frame) => {
    if (!Array.isArray(frame.calls)) return;
    return { kind: 'live', calls: callsOf(frame.calls), thinking: frame.thinking === true };
  },
  failed: (frame) => {
    if (typeof frame.reason !== 'string') return;
    return { kind: 'failed', reason: frame.reason };
  },
  ended: (frame) => {
    if (typeof frame.messageId !== 'string') return { kind: 'ended' };
    return { kind: 'ended', messageId: frame.messageId };
  },
  started: () => ({ kind: 'started' }),
  thought: () => ({ kind: 'thought' }),
};

/** Список вызовов из хранилища: испорченный вызов пропускается, целые берутся. */
const callsOf = (value: readonly unknown[]): readonly ToolCall[] =>
  value.flatMap((call) => {
    if (typeof call !== 'object' || call === null) return [];
    const named = call as Record<string, unknown>;
    if (typeof named.name !== 'string' || typeof named.intent !== 'string') return [];
    return [{ name: named.name, intent: named.intent }];
  });

/** Событие из хранилища: свои поля проверяются, потому что байты приходят снаружи. */
export const eventOfStored = (value: unknown): ChatEvent | undefined => {
  if (typeof value !== 'object' || value === null) return;
  const frame = value as Record<string, unknown>;
  const kind = frame.kind;
  if (!isKind(kind)) return;
  return READERS[kind]?.(frame);
};

/** Запись журнала: момент и событие. Испорченная запись пропускается целиком. */
export const entryOfStored = (value: unknown): LogEntry | undefined => {
  if (typeof value !== 'object' || value === null) return;
  const frame = value as Record<string, unknown>;
  if (typeof frame.at !== 'string') return;
  const event = eventOfStored(frame.event);
  if (event === undefined) return;
  return { at: frame.at, event };
};

/**
 * Ход работы из записи. Сырое поле приходит из базы строкой с байтами JSON —
 * разбираем её; чужой вид не берём, ответ покажется без строки.
 */
export const workOfRaw = (raw: unknown): StoredWork | undefined => {
  const parsed = parsedRaw(raw);
  if (typeof parsed !== 'object' || parsed === null) return;
  const work: unknown = (parsed as Record<string, unknown>).work;
  if (typeof work !== 'object' || work === null) return;
  const fields = work as Record<string, unknown>;
  if (typeof fields.seconds !== 'number') return;
  if (typeof fields.thoughts !== 'number') return;
  if (!Array.isArray(fields.names)) return;
  const names = fields.names.flatMap((name) => {
    if (typeof name !== 'string') return [];
    return [name];
  });
  return { seconds: fields.seconds, names, thoughts: fields.thoughts };
};

/** Журнал из хранилища: байты, которые не читаются, дают пустой журнал. */
export const logOfStored = (raw: string | null): readonly LogEntry[] => {
  if (raw === null || raw === '') return [];
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((value) => {
    const entry = entryOfStored(value);
    if (entry === undefined) return [];
    return [entry];
  });
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
