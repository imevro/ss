/**
 * Бот телеграма. Один набор обработчиков на два входа: вебхук (когда есть
 * публичный адрес) и длинный опрос (когда адреса ещё нет). Разбор обновления
 * делает grammy — свой разбор был бы вторым.
 */
import { createLogger } from '@workspace/log';
import type { IncomingMessage } from '@workspace/types';
import { Bot } from 'grammy';

import { TELEGRAM_WEBHOOK_PATH } from './ingest';
import { acceptBind, acceptMessage, bindChat, queueMessages } from './telegram';

const log = createLogger('bot');

/** Значение по умолчанию: для проверок обработчики можно подменить. */
const withDefault = <T>(value: T | undefined, fallback: T): T => {
  if (value === undefined) return fallback;
  return value;
};

/** Имя человека из обновления. Пустое означает «не сказал». */
const firstNameOf = (from: { first_name?: string } | undefined): string | undefined => {
  if (from === undefined) return;
  return from.first_name;
};

/** Пустая подпись автора — это отсутствие имени, а не пустая строка. */
const orNull = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  return value;
};

/** Название чата для списка: у группы своё, у личной переписки — имя человека. */
const titleOf = (chatTitle: string | undefined, firstName: string | undefined): string => {
  if (chatTitle !== undefined && chatTitle !== '') return chatTitle;
  if (firstName !== undefined && firstName !== '') return firstName;
  return '';
};

export type BotDeps = {
  readonly token: string;
  readonly onBind?: (chatId: string, companyId: string, title: string | null) => Promise<void>;
  readonly onMessages?: (messages: readonly IncomingMessage[]) => Promise<void>;
};

export const createBot = (deps: BotDeps): Bot => {
  const bot = new Bot(deps.token);
  const bind = withDefault(deps.onBind, bindChat);
  const queue = withDefault(deps.onMessages, queueMessages);

  // Разметка одна: команда «/bind <номер>» и ссылка «t.me/бот?start=<номер>».
  bot.command(['bind', 'start'], async (ctx) => {
    const bound = acceptBind(ctx.chat.id, ctx.match);
    if (bound === undefined) return;
    await bind(bound.chatId, bound.companyId, titleOf(ctx.chat.title, firstNameOf(ctx.from)));
  });

  bot.on('message', async (ctx) => {
    const firstName = firstNameOf(ctx.from);
    const message = acceptMessage({
      chatId: ctx.chat.id,
      threadId: ctx.message.message_thread_id,
      chatTitle: titleOf(ctx.chat.title, firstName),
      messageId: ctx.message.message_id,
      date: ctx.message.date,
      authorName: orNull(firstName),
      text: ctx.message.text,
      caption: ctx.message.caption,
    });
    if (message === undefined) return;
    await queue([message]);
  });

  // Сбой обработки не должен ронять бота: телеграм повторит доставку.
  bot.catch((error) => {
    log.error('обработка не удалась', { error: String(error.error) });
  });

  return bot;
};

/**
 * Вход бота. Вебхук ставится, когда задан публичный адрес; иначе бот берёт
 * обновления длинным опросом — так он работает до появления домена.
 */
export const startBot = async (params: {
  readonly token: string;
  readonly publicUrl: string;
  readonly secret: string;
  readonly allowLongPoll: boolean;
}): Promise<Bot | undefined> => {
  if (params.token === '') return;
  const bot = createBot({ token: params.token });
  await bot.init();
  if (params.publicUrl === '') {
    if (params.allowLongPoll) void bot.start();
    return bot;
  }
  // Без этой строки бот молчит: телеграм не знает, куда слать обновления.
  // Пустой секрет означал бы, что вебхук принимает и подделанные обновления.
  if (params.secret === '') throw new Error('публичный адрес задан, а секрет вебхука пуст');
  await bot.api.setWebhook(`${params.publicUrl}${TELEGRAM_WEBHOOK_PATH}`, { secret_token: params.secret });
  return bot;
};
