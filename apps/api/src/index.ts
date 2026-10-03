/**
 * Наш API. Онбординг, вход, бот телеграма, данные для панели.
 * Единственный процесс, который слушает порт и держит комнаты живого потока.
 */
import { createLogger } from '@workspace/log';
import { Hono } from 'hono';
import { describeRoute, openAPIRouteHandler } from 'hono-openapi';
import { z } from 'zod';

import { auth } from './auth';
import { startBot } from './bot';
import { okSchema, userSchema } from './contracts';
import { conversations } from './conversations';
import { docsPage, documentOf, jsonResponse, unauthorized } from './docs';
import { config, setupLogging } from './env';
import { webhookRoutes } from './ingest';
import { liveRoutes, websocket } from './live';
import { onboarding } from './onboarding';
import { problem } from './problem';

setupLogging();
const log = createLogger('api');

const app = new Hono();

/** Живо ли приложение. Этим пользуется выкладка, а не человек. */
app.get(
  '/health',
  describeRoute({
    tags: ['service'],
    summary: 'Живо ли приложение',
    security: [],
    responses: {
      200: jsonResponse('Живо.', okSchema.extend({ at: z.string().meta({ description: 'Время ответа, ISO.' }) })),
    },
  }),
  (c) => c.json({ ok: true, at: new Date().toISOString() }),
);

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

/** Кто я. Остальные маршруты опираются на вход, поэтому он служит и проверкой. */
app.get(
  '/v1/me',
  describeRoute({
    tags: ['service'],
    summary: 'Кто я',
    responses: {
      200: jsonResponse('Вошедший человек.', z.object({ user: userSchema })),
      401: unauthorized,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');
    return c.json({ user: { id: session.user.id, email: session.user.email, name: session.user.name } });
  },
);

app.route('/', onboarding);
app.route('/', conversations);
app.route('/', liveRoutes);

// Документ собирается из описаний у маршрутов, поэтому эти два пути стоят последними:
// всё зарегистрированное выше в него уже попало.
app.get('/openapi', openAPIRouteHandler(app, documentOf()));
app.get('/docs', docsPage);

// Публичного адреса нет — бот берёт обновления длинным опросом. Когда адрес
// появится, тот же бот перейдёт на вебхук, а длинный опрос выключится.
const hasPublicUrl = config.publicUrl !== '';
const bot = await startBot({
  token: config.telegramToken,
  publicUrl: config.publicUrl,
  secret: config.telegramSecret,
  allowLongPoll: !hasPublicUrl,
});
if (bot !== undefined && hasPublicUrl) app.route('/', webhookRoutes(bot, config.telegramSecret));

/** Как бот получает обновления: вебхук при публичном адресе, иначе длинный опрос. */
const botMode = (hasBot: boolean, hasUrl: boolean): string => {
  if (!hasBot) return 'нет';
  if (hasUrl) return 'вебхук';
  return 'длинный опрос';
};

const server = Bun.serve({
  port: config.port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  // Комнаты живого потока: соединение занимает сокет, а не запрос.
  websocket,
});

log.info('слушаю', {
  url: `http://localhost:${server.port}`,
  bot: botMode(bot !== undefined, hasPublicUrl),
});
