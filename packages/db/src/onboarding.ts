/**
 * Онбординг человека: ответы на вопросы, предложение таблиц и состояние.
 * Строка одна на человека — онбординг у него один. Страница читает её и
 * продолжает с того места, где человек остановился, а не начинает заново.
 *
 * Состояние хранится словом, а не перечислением Postgres: сменить набор слов
 * дешевле, чем менять тип в базе.
 */
import { jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newId } from './ids';

export const userOnboarding = pgTable(
  'user_onboarding',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId('onboarding')),
    userId: text('user_id').notNull(),
    /** Компания заводится на подтверждении: до него её нет. */
    companyId: text('company_id'),
    /** Ответы по шагам, по порядку вопросов. */
    answers: jsonb('answers').notNull().default([]),
    /** Предложение таблиц от модели: до первого удачного ответа пусто. */
    proposal: jsonb('proposal'),
    /** Состояние: started | proposal | done. */
    status: text('status').notNull().default('started'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_onboarding_user').on(t.userId)],
);
