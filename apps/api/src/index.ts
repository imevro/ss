/**
 * Наш API. Вебхук, авторизация, данные для миниаппов и комнаты потоков.
 * Единственный процесс, который слушает порт.
 */
import { Hono } from 'hono'
import { createLogger } from '@workspace/logger'
import { auth } from './auth'

const log = createLogger('api')

const app = new Hono()

app.get('/health', (c) => c.json({ ok: true, at: new Date().toISOString() }))

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

/** Кто я и в каких компаниях. Первый настоящий маршрут: остальное проверяет вход. */
app.get('/v1/me', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session === null) return c.json({ error: 'не авторизован' }, 401)
  return c.json({
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
  })
})

const port = Number(process.env.PORT ?? 8787)

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
})

log.info('слушаю', { url: `http://localhost:${server.port}` })
