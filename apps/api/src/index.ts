/**
 * Наш API. Онбординг, вход, живые комнаты, данные для панели.
 * Единственный процесс, который слушает порт и держит комнаты живого потока.
 */
import { createLogger } from '@workspace/log';
import { Hono } from 'hono';
import { describeRoute, openAPIRouteHandler } from 'hono-openapi';
import { z } from 'zod';

import { auth } from './auth';
import { cloudflareRoutes } from './cloudflare';
import { okSchema, userSchema } from './contracts';
import { conversations } from './conversations';
import { docsPage, documentOf, jsonResponse, unauthorized } from './docs';
import { config, setupLogging } from './env';
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
app.route('/', cloudflareRoutes);
app.route('/', liveRoutes);

// Документ собирается из описаний у маршрутов, поэтому эти два пути стоят последними:
// всё зарегистрированное выше в него уже попало.
app.get('/openapi', openAPIRouteHandler(app, documentOf()));
app.get('/docs', docsPage);

const server = Bun.serve({
  port: config.port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
  // Комнаты живого потока: соединение занимает сокет, а не запрос.
  websocket,
});

log.info('слушаю', { url: `http://localhost:${server.port}` });
