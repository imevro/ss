/**
 * Переписка: чаты компании и их сообщения. Лежит в общей базе рядом с компаниями:
 * своей базы у компании нет, а держать переписку больше негде.
 *
 * Идентификаторы — nanoid с префиксом, поэтому колонки text.
 */
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { organization } from './companies';
import { newId } from './ids';

/** Чат компании. `source` — откуда он взялся; сейчас всегда агент. */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId('conversation')),
    companyId: text('company_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('agent'),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Список чатов читается по времени последней записи: без индекса это чтение
  // таблицы целиком с сортировкой.
  (t) => [index('conversations_company_last_message').on(t.companyId, t.lastMessageAt.desc())],
);

/** Запись ленты. `raw` держит ход работы: время, мысли, позванные инструменты. */
export const messages = pgTable(
  'messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId('message')),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    authorName: text('author_name'),
    text: text('text').notNull().default(''),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb('raw').notNull().default({}),
  },
  (t) => [index('messages_conversation_sent').on(t.conversationId, t.sentAt)],
);
