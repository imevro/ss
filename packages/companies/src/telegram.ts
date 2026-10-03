/**
 * Разбор обновлений телеграма. Чистая функция: на входе тело вебхука, на выходе
 * сообщения для чата. Сеть и база тут ни при чём — их трогает оболочка.
 */
import type { IncomingMessage } from '@workspace/types';
import { z } from 'zod';

const chatSchema = z.object({
  id: z.union([z.number(), z.string()]),
  type: z.string(),
  title: z.string().optional(),
  first_name: z.string().optional(),
  username: z.string().optional(),
});

const fromSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

const messageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  message_thread_id: z.number().optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  chat: chatSchema,
  from: fromSchema.optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: messageSchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/** Ключ чата внутри компании. Тема форума — отдельный чат: там своя лента. */
export const conversationIdOf = (chatId: string, threadId: number | undefined): string => {
  if (threadId === undefined) return `tg:${chatId}`;
  return `tg:${chatId}:${threadId}`;
};

const displayName = (from: z.infer<typeof fromSchema> | undefined): string | null => {
  if (from === undefined) return null;
  const parts = [from.first_name, from.last_name].filter((part): part is string => part !== undefined && part !== '');
  if (parts.length > 0) return parts.join(' ');
  if (from.username !== undefined) return from.username;
  return null;
};

const chatTitle = (chat: z.infer<typeof chatSchema>, author: string | null): string => {
  if (chat.title !== undefined && chat.title !== '') return chat.title;
  if (author !== null) return author;
  if (chat.username !== undefined) return chat.username;
  return `чат ${chat.id}`;
};

/** Первое непустое значение: у сообщения текст лежит либо в text, либо в caption. */
const firstDefined = (values: readonly (string | undefined)[]): string => {
  const found = values.find((value) => value !== undefined);
  if (found === undefined) return '';
  return found;
};

/** Разметка одна: команда «/bind <номер>» и ссылка «t.me/бот?start=<номер>». */
const BIND = /^\/(?:bind|start)(?:@\w+)?\s+(\S+)$/;

/** Пустой список означает «брать нечего»: стикеры, служебные события и пустой текст пропускаем. */
export const incomingMessagesOf = (update: TelegramUpdate): readonly IncomingMessage[] => {
  const message = update.message;
  if (message === undefined) return [];
  const text = firstDefined([message.text, message.caption]);
  if (text.trim() === '') return [];
  const author = displayName(message.from);
  return [
    {
      externalId: String(message.message_id),
      conversationId: conversationIdOf(String(message.chat.id), message.message_thread_id),
      conversationTitle: chatTitle(message.chat, author),
      source: 'telegram',
      role: 'user',
      authorName: author,
      text,
      sentAt: new Date(message.date * 1000).toISOString(),
    },
  ];
};

/** Привязка чата к компании: команда «/bind <номер компании>». */
export const bindRequestOf = (
  update: TelegramUpdate,
): { readonly chatId: string; readonly companyId: string } | undefined => {
  const message = update.message;
  if (message === undefined) return;
  // Разметка одна: команда «/bind <номер>» и ссылка «t.me/бот?start=<номер>».
  const match = BIND.exec(firstDefined([message.text]).trim());
  if (match === null) return;
  const companyId = match[1];
  if (companyId === undefined) return;
  return { chatId: String(message.chat.id), companyId };
};
