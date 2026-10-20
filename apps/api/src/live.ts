/**
 * Живой поток. Два входа снаружи:
 *
 * - комната человеку: `GET /v1/rooms/:room` — чат;
 * - задания от воркера: `POST /v1/events/jobs` — что задача сделала.
 *
 * Воркер и API — разные процессы, поэтому вести поток может только тот, кто держит
 * соединение: воркер сообщает о работе, API передаёт это в комнату.
 *
 * Комната проверяется при входе: имя комнаты называет чат,
 * и открывать её чужому нельзя — иначе переписка уходит наружу.
 */
import { platformSql } from '@workspace/db';
import type { ClientEvent } from '@workspace/types';
import { conversationOfRoom } from '@workspace/types';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { upgradeWebSocket, websocket } from 'hono/bun';
import type { WSContext } from 'hono/ws';
import { describeRoute, resolver } from 'hono-openapi';

import { auth } from './auth';
import { companiesOf } from './companies';
import { clientEventSchema, jobEventBodySchema, okSchema } from './contracts';
import { badRequest, bodyOf, forbidden, jsonResponse } from './docs';
import { config } from './env';
import { problem } from './problem';
import { asSocket, joinRoom, leaveRoom, say } from './rooms';

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
  // Чат лежит в базе своей компании, а по номеру чата компанию заранее не видно: спрашиваем
  // по одной базе на каждую компанию человека. Их единицы, и пулы уже открыты.
  // ponytail: обход по компаниям, а не один запрос — номер компании в имени комнаты убрал бы
  // его, но это правка протокола комнат на обеих сторонах; заводить, когда компаний станет много.
  const companies = await companiesOf(session.user.id);
  const owned = await Promise.all(companies.map(async (company) => companyHas(company.id, conversationId)));
  return owned.some((yes) => yes);
};

/** Лежит ли этот чат в базе компании: по ней и решается доступ. */
const companyHas = async (companyId: string, conversationId: string): Promise<boolean> => {
  const tenant = await platformSql(companyId);
  if (tenant === undefined) return false;
  const rows = await tenant<{ id: string }[]>`
    SELECT id FROM ctx.conversations WHERE id = ${conversationId} LIMIT 1
  `;
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
      400: badRequest,
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

/** Что задача сделала. Воркер зовёт этот вход; чужой запрос отбивается паролем. */
liveRoutes.post(
  '/v1/events/jobs',
  describeRoute({
    tags: ['live'],
    summary: 'Воркер рассказывает, что задача сделала',
    description: 'Вход только для воркера: запрос подтверждается общим паролем в заголовке `x-ss-token`.',
    requestBody: { content: { 'application/json': { schema: resolver(jobEventBodySchema) } } },
    security: [],
    responses: {
      200: jsonResponse('Событие передано в комнату.', okSchema),
      400: jsonResponse('Задание не понято.', okSchema),
      403: forbidden,
    },
  }),
  async (c) => {
    const token = c.req.header('x-ss-token');
    if (config.workerToken === '' || token !== config.workerToken) {
      return problem(c, 403, 'forbidden', 'чужой запрос');
    }

    const body = await bodyOf(c);
    if (body === undefined) return problem(c, 400, 'bad_request', 'не понимаю задание');
    const update = updateOf(body);
    if (update === undefined) return problem(c, 400, 'bad_request', 'не понимаю задание');

    say(update.room, update.event);
    return c.json({ ok: true });
  },
);

/** Что пришло от воркера: комната и событие. Разбор на границе, дальше — готовое. */
const updateOf = (
  body: Record<string, unknown>,
): { readonly room: string; readonly event: ClientEvent } | undefined => {
  const room = body.room;
  if (typeof room !== 'string' || room === '') return;
  const event = clientEventSchema.safeParse(body.event);
  if (!event.success) return;
  // Разбор дал ровно тот вид, что объявлен у клиента: приведение не нужно.
  const parsed: ClientEvent = event.data;
  return { room, event: parsed };
};

export { websocket };
