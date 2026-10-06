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
  | { readonly kind: 'started'; readonly messageId?: string }
  | { readonly kind: 'chunk'; readonly text: string }
  | { readonly kind: 'live'; readonly calls: readonly ToolCall[]; readonly thinking: boolean }
  | { readonly kind: 'thought' }
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

/**
 * Конец хода из поля: время — ход закрыт; поле есть, а времени нет — ход идёт;
 * поля нет вовсе — запись старая, её ход считаем закрытым.
 */
const endedAtOfField = (value: unknown): string | null | undefined => {
  if (typeof value === 'string') return value;
  if (value === null) return null;
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
  const calls = callsOfField(fields.calls);
  const base: StoredWork = {
    seconds: fields.seconds,
    names,
    thoughts: fields.thoughts,
    calls,
    thinking: fields.thinking === true,
  };
  const endedAt = endedAtOfField(fields.endedAt);
  if (endedAt === undefined) return base;
  return { ...base, endedAt };
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
