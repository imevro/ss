/**
 * Приём обновлений телеграма через вебхук. Разбор обновления и проверку секрета
 * делает grammy: подделанное обновление до обработчиков не дойдёт.
 */
import type { Bot } from 'grammy';
import { webhookCallback } from 'grammy';
import { Hono } from 'hono';

/** Путь приёма обновлений. Тот же адрес называет телеграму постановка вебхука. */
export const TELEGRAM_WEBHOOK_PATH = '/v1/ingest/telegram';

/** Тот же бот обслуживает и длинный опрос — обработчики у входов общие. */
export const webhookRoutes = (bot: Bot, secret: string): Hono => {
  const handle = webhookCallback(bot, 'hono', { secretToken: secret });
  const routes = new Hono();
  routes.post(TELEGRAM_WEBHOOK_PATH, (c) => handle(c));
  return routes;
};
