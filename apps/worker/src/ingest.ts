/**
 * Приём переписки. Заводит чат, если её ещё нет, и кладёт сообщения в базу
 * компании: одно место правды для телеграма и агента.
 */
import { newId, platformSql } from '@workspace/db';
import { createLogger, messageOf } from '@workspace/log';
import type { IncomingMessage } from '@workspace/types';
import type { Sql } from 'postgres';

const log = createLogger('msg.ingest');

export type IngestResult = {
  readonly status: 'ok' | 'failed';
  readonly conversations: number;
  readonly messages: number;
  readonly reason?: string;
};

/** Что уже записано. Растёт по одному сообщению, носится по кругу без изменений на месте. */
type Stored = { readonly conversations: number; readonly messages: number };

const NOTHING: Stored = { conversations: 0, messages: 0 };

/** Одно сообщение: чат заводится один раз, повтор доставки гасится ключом. */
const storeOne = async (sql: Sql, message: IncomingMessage, done: Stored): Promise<Stored> => {
  const inserted = await sql`
    INSERT INTO ctx.conversations (id, source, external_id, title, last_message_at)
    VALUES (${message.conversationId}, ${message.source}, ${message.conversationId}, ${message.conversationTitle}, ${message.sentAt})
    ON CONFLICT (id) DO UPDATE SET last_message_at = GREATEST(ctx.conversations.last_message_at, EXCLUDED.last_message_at)
    RETURNING id
  `;
  // Телеграм повторяет доставку: ключ (чат, внешний номер) гасит дубли.
  const rows = await sql`
    INSERT INTO ctx.messages (id, conversation_id, role, author_name, text, sent_at, external_id, raw)
    VALUES (${newId('message')}, ${message.conversationId}, ${message.role}, ${message.authorName}, ${message.text}, ${message.sentAt}, ${message.externalId}, ${sql.json({ source: message.source })})
    ON CONFLICT (conversation_id, external_id) DO NOTHING
    RETURNING id
  `;
  return {
    conversations: done.conversations + inserted.length,
    messages: done.messages + rows.length,
  };
};

/** Все сообщения по порядку: следующий шаг получает итог предыдущего. */
const storeAll = async (
  sql: Sql,
  messages: readonly IncomingMessage[],
  index: number,
  done: Stored,
): Promise<Stored> => {
  const message = messages[index];
  if (message === undefined) return done;
  return storeAll(sql, messages, index + 1, await storeOne(sql, message, done));
};

export const ingestMessages = async (
  companyId: string,
  messages: readonly IncomingMessage[],
): Promise<IngestResult> => {
  if (messages.length === 0) return { status: 'ok', conversations: 0, messages: 0 };

  // Пишем ролью компании на запись: схема ctx наша, компания её только читает.
  const sql = await platformSql(companyId);
  if (sql === undefined) return { status: 'failed', conversations: 0, messages: 0, reason: 'у компании нет базы' };

  try {
    const done = await storeAll(sql, messages, 0, NOTHING);
    log.info('переписка записана', { companyId, ...done });
    return { status: 'ok', conversations: done.conversations, messages: done.messages };
  } catch (error) {
    const reason = messageOf(error);
    log.error('запись переписки не удалась', { companyId, reason });
    return { status: 'failed', conversations: 0, messages: 0, reason };
  }
};
