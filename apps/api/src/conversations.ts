/**
 * Чаты и лента. Читаем из базы компании нашей ролью: панель показывает то же,
 * что читает агент, — одного источника правды достаточно.
 *
 * Один вид на весь API: чат — это `conversations`, не `chats`. Описание
 * каждого маршрута стоит рядом с ним.
 */
import { apps, db, newId, platformSql } from '@workspace/db';
import { createLogger } from '@workspace/log';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';

import { runTurn, stopTurn } from './agent';
import { auth } from './auth';
import { companiesOf, databasesOf, findCompany, isMemberOf } from './companies';
import {
  companySchema,
  conversationSchema,
  messageBodySchema,
  messageSchema,
  miniAppSchema,
  textBodySchema,
  writtenSchema,
} from './contracts';
import { badRequest, bodyOf, conflict, forbidden, isoOf, jsonResponse, notFound, unauthorized } from './docs';
import { problem } from './problem';

const log = createLogger('conversations');

export const conversations = new Hono();

/** Панель спрашивает компанию: список чатов этой компании. */
conversations.get(
  '/v1/companies/:id/conversations',
  describeRoute({
    tags: ['conversations'],
    summary: 'Список чатов компании',
    responses: {
      200: jsonResponse(
        'Чаты по убыванию времени последнего сообщения.',
        z.object({ conversations: z.array(conversationSchema) }),
      ),
      401: unauthorized,
      403: forbidden,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const companyId = c.req.param('id');
    if (!(await isMemberOf(session.user.id, companyId))) return problem(c, 403, 'forbidden', 'чужая компания');

    const sql = await platformSql(companyId);
    if (sql === undefined) return problem(c, 409, 'conflict', 'у компании нет базы');

    const rows = await sql<{ id: string; source: string; title: string; last_message_at: string; messages: number }[]>`
      SELECT c.id, c.source, c.title, c.last_message_at::text,
             (SELECT count(*) FROM ctx.messages m WHERE m.conversation_id = c.id)::int AS messages
      FROM ctx.conversations c
      ORDER BY c.last_message_at DESC
      LIMIT 100
    `;
    return c.json({ conversations: rows.map((row) => ({ ...row, last_message_at: isoOf(row.last_message_at) })) });
  },
);

/** Лента одного чата. */
conversations.get(
  '/v1/companies/:id/conversations/:conversationId/messages',
  describeRoute({
    tags: ['conversations'],
    summary: 'Лента чата',
    responses: {
      200: jsonResponse('Сообщения по возрастанию времени.', z.object({ messages: z.array(messageSchema) })),
      401: unauthorized,
      403: forbidden,
      404: notFound,
      409: conflict,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const companyId = c.req.param('id');
    if (!(await isMemberOf(session.user.id, companyId))) return problem(c, 403, 'forbidden', 'чужая компания');

    const sql = await platformSql(companyId);
    if (sql === undefined) return problem(c, 409, 'conflict', 'у компании нет базы');

    const conversationId = c.req.param('conversationId');
    const found = await sql<{ id: string }[]>`SELECT id FROM ctx.conversations WHERE id = ${conversationId}`;
    if (found.length === 0) return problem(c, 404, 'not_found', 'чата нет');

    // Сырое поле отдаём разбору на странице: там из него берётся ход работы.
    const rows = await sql<
      { id: string; role: string; author_name: string | null; text: string; sent_at: string; raw: unknown }[]
    >`
      SELECT id, role, author_name, text, sent_at::text, raw
      FROM ctx.messages
      WHERE conversation_id = ${conversationId}
      ORDER BY sent_at ASC
      LIMIT 500
    `;
    return c.json({ messages: rows.map((row) => ({ ...row, sent_at: isoOf(row.sent_at) })) });
  },
);

/**
 * Сообщение человека. Запись отвечает сразу, ответ агента придёт потоком
 * в комнату чата: человек не ждёт модель в открытом запросе.
 *
 * Признак `interrupt` пускает вопрос вне очереди: идущий ход чата останавливается,
 * и вопрос идёт первым. Без него ходы идут по очереди — так вопросы, написанные
 * поверх идущего ответа, ждут своей очереди, а не перебивают агента.
 */
conversations.post(
  '/v1/companies/:id/conversations/:conversationId/messages',
  describeRoute({
    tags: ['conversations'],
    summary: 'Сказать в чат',
    requestBody: { content: { 'application/json': { schema: resolver(messageBodySchema) } } },
    responses: {
      201: jsonResponse('Сообщение записано.', writtenSchema),
      400: badRequest,
      401: unauthorized,
      403: forbidden,
      404: notFound,
      409: conflict,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const companyId = c.req.param('id');
    if (!(await isMemberOf(session.user.id, companyId))) return problem(c, 403, 'forbidden', 'чужая компания');

    const body = await bodyOf(c);
    if (body === undefined) return problem(c, 400, 'bad_request', 'не понимаю запрос');
    const text = textOf(body);
    if (text === undefined) return problem(c, 400, 'bad_request', 'пустое сообщение');

    const sql = await platformSql(companyId);
    if (sql === undefined) return problem(c, 409, 'conflict', 'у компании нет базы');

    const conversationId = c.req.param('conversationId');
    const found = await sql<{ id: string }[]>`
      SELECT id FROM ctx.conversations WHERE id = ${conversationId}
    `;
    if (found.length === 0) return problem(c, 404, 'not_found', 'чата нет');

    const messageId = newId('message');
    await sql`
      INSERT INTO ctx.messages (id, conversation_id, role, author_name, text)
      VALUES (${messageId}, ${conversationId}, ${'user'}, ${session.user.name}, ${text})
    `;
    await sql`
      UPDATE ctx.conversations SET last_message_at = now() WHERE id = ${conversationId}
    `;

    // Человек не ждёт агента в ответе на запись: вопрос уходит в мост, ответ придёт
    // в комнату чата кусками, а готовый ляжет в ленту.
    // «Сейчас» — идущий ход чата останавливается, вопрос встаёт первым в очереди.
    if (interruptOf(body)) stopTurn(companyId, conversationId);
    void runTurn(companyId, conversationId, text);
    // Номер записи уходит странице: по нему её вопрос уступает записи в ленте.
    return c.json({ ok: true, messageId }, 201);
  },
);

/** Компании человека. Экран выбирает одну — та, что нужна, и показывается. */
conversations.get(
  '/v1/companies',
  describeRoute({
    tags: ['companies'],
    summary: 'Компании человека',
    responses: {
      200: jsonResponse(
        'Компании и состояние их базы.',
        z.object({ companies: z.array(companySchema.extend({ database: z.string() })) }),
      ),
      401: unauthorized,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');
    const list = await companiesOf(session.user.id);
    const databases = await databasesOf(list.map((company) => company.id));
    const withDatabase = list.map((company) => {
      const database = databases.get(company.id);
      if (database === undefined) return { ...company, database: 'нет' };
      return { ...company, database: database.status };
    });
    return c.json({ companies: withDatabase });
  },
);

/**
 * Новый чат с агентом. Человек пишет первое сообщение — чат заводится
 * и появляется в списке; ответ агента придёт потоком в её комнату.
 */
conversations.post(
  '/v1/companies/:id/conversations',
  describeRoute({
    tags: ['conversations'],
    summary: 'Начать чат с агентом',
    requestBody: { content: { 'application/json': { schema: resolver(textBodySchema) } } },
    responses: {
      201: jsonResponse('Чат заведена.', z.object({ conversation: conversationSchema })),
      400: badRequest,
      401: unauthorized,
      403: forbidden,
      404: notFound,
      409: conflict,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const companyId = c.req.param('id');
    if (!(await isMemberOf(session.user.id, companyId))) return problem(c, 403, 'forbidden', 'чужая компания');

    const body = await bodyOf(c);
    if (body === undefined) return problem(c, 400, 'bad_request', 'не понимаю запрос');
    const text = textOf(body);
    if (text === undefined) return problem(c, 400, 'bad_request', 'пустое сообщение');

    const sql = await platformSql(companyId);
    if (sql === undefined) return problem(c, 409, 'conflict', 'у компании нет базы');

    // Номер чата делаем сами: он уходит в адрес панели и в подписку на поток.
    const conversationId = newId('conversation');
    // Заголовок — имя компании: список чатов читается по делу, а не по первой фразе.
    const company = await findCompany(companyId);
    if (company === undefined) return problem(c, 404, 'not_found', 'компании нет');

    await sql`
      INSERT INTO ctx.conversations (id, source, title)
      VALUES (${conversationId}, ${'agent'}, ${company.name})
    `;
    const messageId = newId('message');
    await sql`
      INSERT INTO ctx.messages (id, conversation_id, role, author_name, text)
      VALUES (${messageId}, ${conversationId}, ${'user'}, ${session.user.name}, ${text})
    `;
    log.info('чат заведена', { companyId, conversationId });
    // Первое сообщение — такое же начало хода, как и любое следующее: без этого
    // новый чат оставался без ответа.
    void runTurn(companyId, conversationId, text);
    return c.json({ conversation: { id: conversationId, title: company.name, source: 'agent' } }, 201);
  },
);

/** Миниаппы компании: список для панели. Пустой список — панель показывает это сама. */
conversations.get(
  '/v1/companies/:id/apps',
  describeRoute({
    tags: ['companies'],
    summary: 'Миниаппы компании',
    responses: {
      200: jsonResponse('Миниаппы.', z.object({ apps: z.array(miniAppSchema) })),
      401: unauthorized,
      403: forbidden,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const companyId = c.req.param('id');
    if (!(await isMemberOf(session.user.id, companyId))) return problem(c, 403, 'forbidden', 'чужая компания');

    const rows = await db
      .select({ id: apps.id, name: apps.name, url: apps.url })
      .from(apps)
      .where(eq(apps.companyId, companyId))
      .limit(100);
    return c.json({ apps: rows });
  },
);

const textOf = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null) return;
  const value = (body as Record<string, unknown>).text;
  if (typeof value !== 'string' || value.trim() === '') return;
  return value.trim();
};

/** Просьба пустить вопрос сейчас. Признака нет или он не признак — вопрос в очередь. */
const interruptOf = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null) return false;
  if (!('interrupt' in body)) return false;
  return body.interrupt === true;
};
