/**
 * Приём переписки из телеграма. Чистая часть: собрать сообщение из полей
 * сообщения телеграма, привязать чат к компании. Разбор имени команд и
 * разметку даёт grammy — свой разбор был бы вторым.
 */
import { chatBindings, companies, db } from '@workspace/db';
import { createLogger } from '@workspace/log';
import type { IncomingMessage } from '@workspace/types';
import { and, eq } from 'drizzle-orm';

import { enqueue } from './queue';

const log = createLogger('telegram');

/** Привязка чата: «/bind <номер>» или «/start <номер>». */
export const acceptBind = (
  chatId: number,
  match: string,
): { readonly chatId: string; readonly companyId: string } | undefined => {
  const companyId = match.trim().split(SPACES)[0];
  if (companyId === undefined || companyId === '') return;
  return { chatId: String(chatId), companyId };
};

export type RawMessage = {
  readonly chatId: number;
  readonly threadId: number | undefined;
  readonly chatTitle: string;
  readonly messageId: number;
  readonly date: number;
  readonly authorName: string | null;
  readonly text: string | undefined;
  readonly caption: string | undefined;
};

/** Разделитель слов в команде привязки. */
const SPACES = /\s+/;

/** Текст берём из text или из подписи: у файла с подписью текст лежит во втором. */
const textOf = (raw: RawMessage): string => {
  if (raw.text !== undefined) return raw.text;
  if (raw.caption !== undefined) return raw.caption;
  return '';
};

/** Номер чата: у темы внутри группы свой ключ, у остальных — общий на чат. */
const conversationIdOf = (chatId: number, threadId: number | undefined): string => {
  if (threadId === undefined) return `tg:${chatId}`;
  return `tg:${chatId}:${threadId}`;
};

/**
 * Сообщение для записи. Пустой текст означает «брать нечего»: стикеры, служебные
 * события и пустые подписи пропускаем.
 */
export const acceptMessage = (raw: RawMessage): IncomingMessage | undefined => {
  const text = textOf(raw);
  if (text.trim() === '') return;
  return {
    externalId: String(raw.messageId),
    conversationId: conversationIdOf(raw.chatId, raw.threadId),
    conversationTitle: raw.chatTitle,
    source: 'telegram',
    role: 'user',
    authorName: raw.authorName,
    text,
    sentAt: new Date(raw.date * 1000).toISOString(),
  };
};

/** Название чата: что дал телеграм, а если пусто — имя компании. */
const titleOrCompany = (title: string | null, companyName: string): string => {
  if (title === null) return companyName;
  return title;
};

/** Привязка чата к компании. Ссылку даёт человек, у которого есть право её дать. */
export const bindChat = async (chatId: string, companyId: string, title: string | null): Promise<void> => {
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const company = rows[0];
  if (company === undefined) {
    log.warn('привязка: компании нет', { companyId });
    return;
  }
  const name = titleOrCompany(title, company.name);
  await db
    .insert(chatBindings)
    .values({ companyId, chatId, channel: 'telegram', title: name })
    .onConflictDoUpdate({
      target: [chatBindings.channel, chatBindings.chatId],
      set: { companyId, title: name },
    });
  log.info('чат привязан', { chatId, companyId });
};

export const companyOfChat = async (chatId: string): Promise<string | undefined> => {
  const rows = await db
    .select()
    .from(chatBindings)
    .where(and(eq(chatBindings.channel, 'telegram'), eq(chatBindings.chatId, chatId)))
    .limit(1);
  return rows[0]?.companyId;
};

/** Номер чата из ключа чата: `tg:555` и `tg:555:12` дают 555. */
const chatIdOf = (messages: readonly IncomingMessage[]): string | undefined => {
  const first = messages[0];
  if (first === undefined) return;
  return first.conversationId.split(':')[1];
};

/** Работа по сообщениям уходит в очередь: вебхук отвечает телеграму сразу. */
export const queueMessages = async (messages: readonly IncomingMessage[]): Promise<void> => {
  const chatId = chatIdOf(messages);
  if (chatId === undefined) return;
  const companyId = await companyOfChat(chatId);
  if (companyId === undefined) {
    log.info('сообщение пропущено: чат не привязан', { chatId });
    return;
  }
  const jobId = await enqueue('msg:ingest', { companyId, messages });
  log.info('сообщение принято', { companyId, chatId, jobId });
};
