/**
 * Живой поток. Два входа снаружи:
 *
 * - комната человеку: `GET /v1/rooms/:room` — чат.
 *
 * Ведёт поток тот, кто держит соединение: событие агента приходит в API и уходит в комнату.
 *
 * Комната проверяется при входе: имя комнаты называет чат,
 * и открывать её чужому нельзя — иначе переписка уходит наружу.
 */

import { conversations as chatTable, db, member } from '@workspace/db';
import { conversationOfRoom } from '@workspace/types';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { upgradeWebSocket, websocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { describeRoute, resolver } from 'hono-openapi';

import { auth } from './auth';
import { clientEventSchema } from './contracts';
import { forbidden } from './docs';
import { problem } from './problem';
import { asSocket, joinRoom, leaveRoom } from './rooms';

export const liveRoutes = new Hono();

/**
 * Дверь комнаты: проверка стоит до перехода в вебсокет, потому что после перехода
 * ответить отказом уже нельзя — соединение открыто.
 */
const guard: MiddlewareHandler = async (c, next) => {
  const room = c.req.param('room');
  if (room === undefined) return problem(c, 400, 'bad_request', 'нет имени комнаты');
  const allowed = await mayEnterRoom(room, c.req.raw.headers);
  if (!allowed) return problem(c, 403, 'forbidden', 'чужая комната');
  await next();
};

/**
 * Чья это комната. Имя комнаты разбирается на вид и владельца: вид решает, что
 * проверять, а без входа не проходит ни одна комната.
 */
const mayEnterRoom = async (room: string, headers: Headers): Promise<boolean> => {
  const session = await auth.api.getSession({ headers });
  if (session === null) return false;
  const conversationId = conversationOfRoom(room);
  if (conversationId === undefined) return false;
  // Чат лежит в общей базе: одним запросом сразу видно и компанию, и членство.
  const rows = await db
    .select({ id: chatTable.id })
    .from(chatTable)
    .innerJoin(member, and(eq(member.organizationId, chatTable.companyId), eq(member.userId, session.user.id)))
    .where(eq(chatTable.id, conversationId))
    .limit(1);
  return rows.length > 0;
};

/** Комната человеку: `conversation:<номер чата>`. */
liveRoutes.get(
  '/v1/rooms/:room',
  describeRoute({
    tags: ['live'],
    summary: 'Живая комната',
    description: [
      'Подписка на события. Соединение переходит в вебсокет: обычный запрос сюда не годится.',
      '',
      'Комната: `conversation:<номер чата>` — куски ответа агента и ход работы.',
      '',
      'Комнату открывает только владелец её компании. Чужой запрос получает отказ',
      'и перехода не получает.',
      '',
      'Требуется вход: комната открывается по печенью сессии, как и остальные пути.',
    ].join('\n'),
    responses: {
      101: {
        description: 'Соединение перешло в вебсокет.',
        content: { 'application/json': { schema: resolver(clientEventSchema) } },
      },
      403: forbidden,
    },
  }),
  guard,
  upgradeWebSocket((c) => {
    const room = c.req.param('room');
    if (room === undefined) return {};
    return {
      onOpen: (_event: Event, ws: WSContext) => {
        joinRoom(room, asSocket(ws.raw));
      },
      onClose: (_event: CloseEvent, ws: WSContext) => {
        leaveRoom(room, asSocket(ws.raw));
      },
    };
  }),
);

export { websocket };
