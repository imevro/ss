/**
 * Журнал шагов. Таблица живёт тут, потому что схемы принадлежат этому пакету.
 * Логика записи — в @workspace/logger.
 *
 * Отдельно от audit_log: там действия людей над данными, тут ход работы агента.
 */
import { bigint, index, integer, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'

export const ctxSteps = pgTable(
  'ctx_steps',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    // Прогон, к которому относится шаг. Вне очереди — 'anon', явный признак, а не выдуманный ключ.
    runId: text('run_id').notNull(),
    companyId: text('company_id'),
    // Кто выполнил шаг: имя агента или имя детерминированной фазы.
    agent: text('agent').notNull(),
    model: text('model'),
    /**
     * Узел обработки, который реально обслужил вызов, на момент записи.
     * Только для разбора: расход считается по провайдеру из контекста.
     */
    servingProvider: text('serving_provider'),
    // Настоящее имя инструмента или фазы. 'error:*' сюда не пишем — исход живёт в kind.
    toolName: text('tool_name').notNull(),
    /** running → ok | error | skip. Единственный источник состояния шага. */
    kind: text('kind').notNull().default('running'),
    explanation: text('explanation'),
    argsPreview: text('args_preview'),
    resultPreview: text('result_preview'),
    durationMs: integer('duration_ms'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    cachedTokens: integer('cached_tokens'),
    // 0 ≠ NULL: 0 — вызов был бесплатным, NULL — величина неприменима.
    costUsd: real('cost_usd'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('ctx_steps_run_idx').on(t.runId, t.createdAt),
    index('ctx_steps_company_idx').on(t.companyId, t.createdAt),
  ],
)
