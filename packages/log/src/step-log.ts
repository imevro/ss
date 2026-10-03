/**
 * Журнал шагов. Одна дверь для всего, что делают агент и воркер: шаг открывается
 * записью «идёт», закрывается той же записью с результатом. Второго пути записи
 * нет, поэтому строки не могут разойтись по форме.
 */

import { db } from '@workspace/db';
import { and, eq } from 'drizzle-orm';

import { createLogger } from './line-log';
import { ctxSteps } from './schema';

const log = createLogger('step-log');

export type StepLogContext = {
  /** Прогон, к которому относится шаг. Вне очереди — 'anon'. */
  readonly runId?: string;
  readonly companyId?: string;
  /** Кто выполнил шаг: имя агента или имя детерминированной фазы. */
  readonly agent: string;
  readonly model?: string | null;
  /** Действующий узел обработки модели на момент записи. Неизвестен — NULL. */
  readonly providerOf?: () => string | undefined;
};

/** Исход шага. 'running' ставит только start() и в finish() не передаётся. */
export type StepKind = 'ok' | 'error' | 'skip';

export type StepStartArgs = {
  readonly ctx: StepLogContext;
  readonly toolName: string;
  readonly explanation?: string | null;
  /** Вход шага: аргументы инструмента или вход фазы. */
  readonly input?: unknown;
};

export type StepFinishArgs = {
  /** Выход шага: результат инструмента, выход фазы или текст ошибки. */
  readonly output: unknown;
  readonly kind?: StepKind;
  /**
   * Итоговая строка «что сделал шаг». Отсутствует — остаётся та, что дал start().
   * Пустое значение (null) очищает поле.
   */
  readonly explanation?: string | null;
  readonly costUsd?: number | null;
  readonly tokens?: { promptTokens: number; completionTokens: number; cachedTokens: number } | null;
  /** Замена автоматической длительности: путь модели несёт свою долю времени. */
  readonly durationMs?: number | null;
};

export type StepHandle = { finish(args: StepFinishArgs): Promise<void> };

const EXPLANATION_MAX_CHARS = 400;
const PREVIEW_MAX_CHARS = 8000;

const truncate = (value: string | null | undefined, max: number): string | null => {
  if (value === null || value === undefined) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
};

/** Отсутствие — это NULL, а не строка «null». Строка проходит как есть, остальное — JSON. */
const previewColumn = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const orNull = <T>(value: T | null | undefined): T | null => {
  if (value === undefined || value === null) return null;
  return value;
};

const runIdOrAnon = (runId: string | undefined): string => {
  if (runId === undefined) return 'anon';
  return runId;
};

const servingProvider = (ctx: StepLogContext): string | null => {
  if (ctx.providerOf === undefined) return null;
  const slug = ctx.providerOf();
  if (slug === undefined) return null;
  return slug;
};

/**
 * Выход обязан быть самими данными. Запись вида { message: … } заслонила бы их
 * в ленте, поэтому это отказ контракта, а не тихая запись в stderr.
 */
const assertPayloadOutput = (output: unknown): void => {
  if (output !== null && typeof output === 'object' && !Array.isArray(output) && 'message' in output) {
    throw new Error('logStep: выход должен быть данными шага — ключ message запрещён');
  }
};

/** Текст ошибки: у ошибки берём сообщение, у прочего — строку. */
export const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const NOOP_HANDLE: StepHandle = {
  async finish() {
    // пусто намеренно: строки не было
  },
};

const finishKind = (kind: StepKind | undefined): StepKind => {
  if (kind === undefined) return 'ok';
  return kind;
};

const explanationOrNull = (explanation: string | null | undefined): string | null | undefined => {
  if (explanation === undefined) return explanation;
  return truncate(explanation, EXPLANATION_MAX_CHARS);
};

const finishDuration = (override: number | null | undefined, startedAtMs: number): number | null => {
  if (override !== undefined) return override;
  return Date.now() - startedAtMs;
};

/** Пустое значение неотличимо от отсутствия: в тексте журнала разницы нет. */
/** Пустая строка и отсутствие значения одинаковы для журнала: пишем NULL. */
const textOrNull = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null || value === '') return null;
  return value;
};

/**
 * Закрытие строки. WHERE требует kind='running': строка закрывается один раз,
 * поэтому повторный finish ничего не делает.
 */
const makeFinishHandle = (id: number, startedAtMs: number): StepHandle => ({
  async finish(args: StepFinishArgs): Promise<void> {
    assertPayloadOutput(args.output);
    try {
      await db
        .update(ctxSteps)
        .set({
          kind: finishKind(args.kind),
          explanation: explanationOrNull(args.explanation),
          resultPreview: truncate(previewColumn(args.output), PREVIEW_MAX_CHARS),
          costUsd: orNull(args.costUsd),
          promptTokens: orNull(args.tokens?.promptTokens),
          completionTokens: orNull(args.tokens?.completionTokens),
          cachedTokens: orNull(args.tokens?.cachedTokens),
          durationMs: orNull(finishDuration(args.durationMs, startedAtMs)),
          finishedAt: new Date(),
        })
        .where(and(eq(ctxSteps.id, id), eq(ctxSteps.kind, 'running')));
    } catch (error) {
      log.error('закрытие шага не удалось', { id, error: messageOf(error) });
    }
  },
});

export const logStep = {
  /** Открыть шаг: строка появляется сразу, с состоянием «идёт». Работа важнее записи. */
  async start(args: StepStartArgs): Promise<StepHandle> {
    const startedAtMs = Date.now();
    try {
      const rows = await db
        .insert(ctxSteps)
        .values({
          runId: runIdOrAnon(args.ctx.runId),
          companyId: args.ctx.companyId,
          agent: args.ctx.agent,
          model: orNull(args.ctx.model),
          servingProvider: servingProvider(args.ctx),
          toolName: args.toolName,
          kind: 'running',
          explanation: textOrNull(truncate(args.explanation, EXPLANATION_MAX_CHARS)),
          argsPreview: textOrNull(truncate(previewColumn(args.input), PREVIEW_MAX_CHARS)),
        })
        .returning({ id: ctxSteps.id });
      const row = rows[0];
      if (row === undefined) return NOOP_HANDLE;
      return makeFinishHandle(row.id, startedAtMs);
    } catch (error) {
      log.error('открытие шага не удалось', { toolName: args.toolName, error: messageOf(error) });
      return NOOP_HANDLE;
    }
  },
};
