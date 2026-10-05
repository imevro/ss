/**
 * Доступ к платформе Cloudflare. Ключ аккаунта лежит только здесь и наружу не уходит:
 * кланкер приходит со своим ключом нашего образца, мы его проверяем, а к платформе
 * обращаемся своим ключом.
 *
 * Граница держится четырьмя проверками: ключ наш → аккаунт наш → область разрешена →
 * имя ресурса начинается с начала имени компании. Поэтому чужой воркер того же аккаунта
 * закрыт, хотя аккаунт один на всех. Перечисления закрыты отдельно: они вернули бы чужие
 * имена и номера, по которым имя уже не прочитать.
 */
import { apiKeys, db } from '@workspace/db';
import { createLogger } from '@workspace/log';
import { desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';

import { auth } from './auth';
import { companiesOf } from './companies';
import { issuedKeySchema, keyBodySchema, keySchema } from './contracts';
import { badRequest, bodyOf, forbidden, jsonResponse, unauthorized } from './docs';
import { config } from './env';
import { problem } from './problem';

const log = createLogger('cloudflare');

export const cloudflareRoutes = new Hono();

/** Что разрешено ключу компании, если в метаданных не сказано иного. */
const AREAS = ['workers', 'durable_objects', 'd1'] as const;

/** Наш адрес входа и путь до платформы: дальше путь такой же, как у Cloudflare. */
const PATH_PREFIX = '/v1/cloudflare';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/** Сколько ждём платформу. Выкладка бота занимает секунды; запас на медленную сеть. */
const DEADLINE_MS = 300_000;

const DAY_SECONDS = 86_400;
const MAX_DAYS = 365;

/**
 * Что чем открывается. Путь у платформы один и тот же у неё и у нас: начало пути — семья
 * ресурсов, а наша область — это то, что записано в ключе. Пространства объектов лежат под
 * `workers`, поэтому область `durable_objects` открывает именно их, а не весь `workers`.
 */
const BASES: readonly { readonly area: string; readonly base: string }[] = [
  { area: 'workers', base: 'workers/scripts' },
  // Готовые средства (wrangler) смотрят воркер ещё и здесь: то же имя, тот же воркер.
  { area: 'workers', base: 'workers/services' },
  { area: 'workers', base: 'workers/workers' },
  { area: 'durable_objects', base: 'workers/durable_objects/namespaces' },
  { area: 'd1', base: 'd1/database' },
];

/** Семьи, где ресурс адресуется ещё и номером: номер выдаёт платформа при создании. */
const BY_NUMBER = ['d1/database', 'workers/durable_objects/namespaces'];

/**
 * Общие настройки воркеров: их читает `wrangler`, чтобы показать адрес бота. Читать можно,
 * менять нельзя — поддомен воркеров у аккаунта один на всех, и он не наше хозяйство.
 */
const READ_ONLY_BASES: readonly { readonly area: string; readonly base: string }[] = [
  { area: 'workers', base: 'workers/subdomain' },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLAIN_ID = /^[0-9a-f]{32}$/;

/** Что мы знаем о ключе: его компания и её области. */
type KeyFacts = { readonly companyId: string; readonly areas: readonly string[] };

/** Что делать с запросом: путь к платформе и, если имя пришло телом, само тело. */
type Plan = { readonly tail: string; readonly body?: string };

const reasonOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'отказ без объяснения';
};

/** Разбор JSON без исключения: мусор даёт пустое значение. */
const parsedJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Метаданные строки ключа: там лежит наш JSON, чужих значений там быть не может. */
const metadataOf = (raw: string | null): Record<string, unknown> => {
  if (raw === null) return {};
  const parsed = parsedJson(raw);
  if (typeof parsed !== 'object' || parsed === null) return {};
  return parsed as Record<string, unknown>;
};

/** Области из метаданных: пусто или мусор — берём умолчание. */
const areasOfMeta = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return AREAS;
  const names = value.filter(
    (item): item is string => typeof item === 'string' && (AREAS as readonly string[]).includes(item),
  );
  if (names.length === 0) return AREAS;
  return names;
};

const factsOf = (metadata: unknown): KeyFacts | undefined => {
  if (typeof metadata !== 'object' || metadata === null) return;
  const record = metadata as Record<string, unknown>;
  const companyId = record.companyId;
  if (typeof companyId !== 'string' || companyId === '') return;
  return { companyId, areas: areasOfMeta(record.areas) };
};

/**
 * Ключ кланкера. Наш заголовок — `x-ss-token`; но готовые средства (wrangler и подобные)
 * умеют только `Authorization: Bearer`, поэтому ключ нашего вида принимаем и оттуда.
 */
const keyOf = (c: Context): string | undefined => {
  const own = c.req.header('x-ss-token');
  if (own !== undefined && own !== '') return own;

  const header = c.req.header('authorization');
  if (header === undefined) return;
  if (!header.startsWith('Bearer ')) return;

  const value = header.slice('Bearer '.length);
  if (!value.startsWith('ss_cf_')) return;
  return value;
};

/** Проверка ключа кланкера. Не подошёл — пусто: наружу это один и тот же отказ. */
const verifiedKeyOf = async (key: string): Promise<KeyFacts | undefined> => {
  try {
    const answer = await auth.api.verifyApiKey({ body: { key } });
    const record = answer.key;
    if (record === null) return;
    return factsOf(record.metadata);
  } catch (error) {
    log.warn('ключ не прошёл проверку', { reason: reasonOf(error) });
  }
};

/** Член компании. Отвечает номером компании или готовым отказом. */
const companyOfMember = async (c: Context): Promise<Response | string> => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

  const companyId = c.req.param('id');
  if (companyId === undefined) return problem(c, 400, 'bad_request', 'не указана компания');

  const list = await companiesOf(session.user.id);
  if (!list.some((company) => company.id === companyId)) return problem(c, 403, 'forbidden', 'чужая компания');
  return companyId;
};

/** Срок жизни ключа: нет поля — год, мусор — отказ. */
const daysOf = (body: Record<string, unknown>): number | undefined => {
  const value = body.days;
  if (value === undefined) return MAX_DAYS;
  if (typeof value !== 'number' || !Number.isInteger(value)) return;
  if (value < 1 || value > MAX_DAYS) return;
  return value;
};

/** Области заказа: нет поля — все три, мусор или пусто — отказ. */
const areasOfBody = (body: Record<string, unknown>): string[] | undefined => {
  const value = body.areas;
  if (value === undefined) return [...AREAS];
  if (!Array.isArray(value) || value.length === 0) return;
  const names = value.filter(
    (item): item is string => typeof item === 'string' && (AREAS as readonly string[]).includes(item),
  );
  if (names.length !== value.length) return;
  return names;
};

const nameOfBody = (body: Record<string, unknown>): string | undefined => {
  const value = body.name;
  if (typeof value !== 'string' || value.trim() === '') return;
  return value;
};

const isoOf = (value: Date | null): string | null => {
  if (value === null) return null;
  return value.toISOString();
};

/** Метод с телом: GET и HEAD тела не несут, и передавать его нельзя. */
const carriesBody = (method: string): boolean => method !== 'GET' && method !== 'HEAD';

/** Заголовки запроса к платформе: наши служебные убираем, ключ аккаунта ставим. */
const outgoingHeaders = (from: Headers): Headers => {
  const headers = new Headers(from);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('connection');
  headers.delete('x-ss-token');
  headers.set('authorization', `Bearer ${config.cloudflareToken}`);
  return headers;
};

/** Заголовки ответа: тело сеть уже разжала, поэтому старые заголовки о теле — враньё. */
const incomingHeaders = (from: Headers): Headers => {
  const headers = new Headers(from);
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  headers.delete('connection');
  return headers;
};

/** Адресуется ли ресурс номером, а не именем. */
const isNumber = (name: string): boolean => {
  if (UUID.test(name)) return true;
  return PLAIN_ID.test(name);
};

/** Отказ по области: одна и та же строка на всех путях. */
const areasRefusal = (c: Context, facts: KeyFacts): Response =>
  problem(c, 403, 'forbidden', `область не разрешена; разрешены: ${facts.areas.join(', ')}`);

/**
 * Общая настройка воркеров: поддомен. Читать можно — его смотрит `wrangler`. Пусто — запрос
 * не про неё, и разбор идёт дальше.
 */
const settingsPlan = (c: Context, facts: KeyFacts, rest: string, tail: string): Response | Plan | undefined => {
  const settings = READ_ONLY_BASES.find((item) => rest === item.base);
  if (settings === undefined) return;
  if (!facts.areas.includes(settings.area)) return areasRefusal(c, facts);
  if (c.req.method !== 'GET') return problem(c, 403, 'forbidden', 'менять общие настройки воркеров нельзя');
  return { tail };
};

/** Ресурс без имени в пути: перечисление закрыто, имя создания приходит телом. */
const namelessPlan = async (c: Context, tail: string, scope: string): Promise<Response | Plan> => {
  if (c.req.method === 'GET') {
    return problem(c, 403, 'forbidden', 'перечисление закрыто: обращайся к своим ресурсам по имени');
  }
  if (c.req.method !== 'POST') return problem(c, 400, 'bad_request', 'не указано, что запрашивается');

  // Тело пересылаем теми же байтами, что прочитали: имя проверяем, тело не пересобираем.
  const raw = await c.req.text();
  const named = nameOfBody(metadataOf(raw));
  if (named === undefined) return problem(c, 400, 'bad_request', 'нужно имя ресурса: name');
  if (!named.startsWith(scope)) return problem(c, 403, 'forbidden', `чужое имя: твоё начинается с ${scope}`);
  return { tail, body: raw };
};

/** Ресурс по имени в пути: имя обязано быть своим, номер — только там, где он есть у платформы. */
const namedPlan = (c: Context, base: string, tail: string, name: string, scope: string): Response | Plan => {
  if (name.startsWith(scope)) return { tail };
  if (BY_NUMBER.includes(base) && isNumber(name)) return { tail };
  return problem(c, 403, 'forbidden', `чужое имя: твоё начинается с ${scope}`);
};

/**
 * Что запрашивается у платформы. Разбор возвращается планом, отказ — готовым ответом.
 * Перечисления закрыты: список вернул бы чужие имена и номера, а по номеру имя не видно.
 */
const planOf = async (c: Context, facts: KeyFacts, scope: string): Promise<Response | Plan> => {
  const tail = c.req.path.slice(PATH_PREFIX.length);
  if (tail === '' || tail === '/') return problem(c, 400, 'bad_request', 'не указано, что запрашивается');

  const accountPrefix = `/accounts/${config.cloudflareAccount}/`;
  if (!tail.startsWith(accountPrefix)) return problem(c, 403, 'forbidden', 'чужой аккаунт');

  const rest = tail.slice(accountPrefix.length);
  const settings = settingsPlan(c, facts, rest, tail);
  if (settings !== undefined) return settings;

  const here = BASES.find((item) => rest === item.base || rest.startsWith(`${item.base}/`));
  if (here === undefined) {
    const allowed = BASES.filter((item) => facts.areas.includes(item.area))
      .map((item) => item.base)
      .join(', ');
    return problem(c, 403, 'forbidden', `путь не разрешён; разрешено: ${allowed}`);
  }
  if (!facts.areas.includes(here.area)) return areasRefusal(c, facts);

  const after = rest.slice(here.base.length);
  if (after === '/') return problem(c, 400, 'bad_request', 'не указано, что запрашивается');

  const name = after.split('/')[1];
  if (name === undefined) return await namelessPlan(c, tail, scope);
  return namedPlan(c, here.base, tail, name, scope);
};

/** Тело запроса к платформе: прочитанное имя — как есть, остальное — потоком. */
const requestBodyOf = (c: Context, plan: Plan): RequestInit['body'] | undefined => {
  if (!carriesBody(c.req.method)) return;
  if (plan.body !== undefined) return plan.body;
  const stream = c.req.raw.body;
  if (stream === null) return;
  return stream;
};

/** Выдать ключ доступа к платформе. */
cloudflareRoutes.post(
  '/v1/companies/:id/keys',
  describeRoute({
    tags: ['cloudflare'],
    summary: 'Выдать ключ доступа к платформе Cloudflare',
    description: [
      'Ключ наш, не Cloudflare: он принимается только на нашем прокси `/v1/cloudflare`.',
      'Имя любого ресурса, который этим ключом создаётся, обязано начинаться с начала имени',
      'компании строчными: `comp-<номер>-`. Строка ключа показывается один раз, при выдаче.',
    ].join(' '),
    requestBody: { content: { 'application/json': { schema: resolver(keyBodySchema) } } },
    responses: {
      200: jsonResponse('Выданный ключ. Строку ключа больше нигде не видно.', issuedKeySchema),
      400: badRequest,
      401: unauthorized,
      403: forbidden,
    },
  }),
  async (c) => {
    const who = await companyOfMember(c);
    if (who instanceof Response) return who;

    const body = await bodyOf(c);
    if (body === undefined) return problem(c, 400, 'bad_request', 'нужно тело: name, days, areas');

    const name = nameOfBody(body);
    if (name === undefined) return problem(c, 400, 'bad_request', 'нужно имя ключа: name');

    const days = daysOf(body);
    if (days === undefined) return problem(c, 400, 'bad_request', `срок days — целое от 1 до ${MAX_DAYS}`);

    const areas = areasOfBody(body);
    if (areas === undefined)
      return problem(c, 400, 'bad_request', 'области areas — непустой список известных областей');

    const issued = await auth.api.createApiKey({
      body: { name, expiresIn: days * DAY_SECONDS, metadata: { companyId: who, areas } },
      headers: c.req.raw.headers,
    });

    log.info('ключ выдан', { companyId: who, keyId: issued.id, areas });
    return c.json({ id: issued.id, key: issued.key, name: issued.name, areas });
  },
);

/** Список ключей компании: строки ключей не отдаются никогда. */
cloudflareRoutes.get(
  '/v1/companies/:id/keys',
  describeRoute({
    tags: ['cloudflare'],
    summary: 'Список ключей компании',
    description: 'Ключи компании по убыванию времени выдачи. Строки ключей здесь не показываются.',
    responses: {
      200: jsonResponse('Ключи компании.', z.object({ keys: z.array(keySchema) })),
      401: unauthorized,
      403: forbidden,
    },
  }),
  async (c) => {
    const who = await companyOfMember(c);
    if (who instanceof Response) return who;

    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        start: apiKeys.start,
        enabled: apiKeys.enabled,
        createdAt: apiKeys.createdAt,
        lastRequest: apiKeys.lastRequest,
        metadata: apiKeys.metadata,
      })
      .from(apiKeys)
      .where(sql`${apiKeys.metadata}::jsonb ->> 'companyId' = ${who}`)
      .orderBy(desc(apiKeys.createdAt));

    return c.json({
      keys: rows.map((row) => ({
        id: row.id,
        name: row.name,
        start: row.start,
        areas: areasOfMeta(metadataOf(row.metadata).areas),
        enabled: row.enabled,
        createdAt: row.createdAt.toISOString(),
        lastRequest: isoOf(row.lastRequest),
      })),
    });
  },
);

/** Отозвать ключ. Чужой ключ компании не отличается от несуществующего. */
cloudflareRoutes.delete(
  '/v1/companies/:id/keys/:keyId',
  describeRoute({
    tags: ['cloudflare'],
    summary: 'Отозвать ключ компании',
    description: 'После отзыва ключ не принимается прокси: он живёт в нашей базе, а не в подписи.',
    responses: {
      200: jsonResponse('Ключ отозван.', z.object({ ok: z.boolean() })),
      401: unauthorized,
      403: forbidden,
      404: { description: 'Ключа нет.' },
    },
  }),
  async (c) => {
    const who = await companyOfMember(c);
    if (who instanceof Response) return who;

    const keyId = c.req.param('keyId');
    if (keyId === undefined) return problem(c, 400, 'bad_request', 'не указан ключ');

    const rows = await db.select({ metadata: apiKeys.metadata }).from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);
    const row = rows[0];
    if (row === undefined) return problem(c, 404, 'not_found', 'ключа нет');
    if (metadataOf(row.metadata).companyId !== who) return problem(c, 404, 'not_found', 'ключа нет');

    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    log.info('ключ отозван', { companyId: who, keyId });
    return c.json({ ok: true });
  },
);

/** Описание прокси: одно на все методы. */
const PROXY_SPEC = {
  tags: ['cloudflare'],
  summary: 'Прокси к платформе Cloudflare',
  description: [
    'Единственный вход кланкера на платформу. Ключ компании вида `ss_cf_…` приходит в заголовке',
    '`x-ss-token` или в `Authorization: Bearer` — второе нужно, чтобы работал обычный wrangler',
    '(ему ставят `CLOUDFLARE_API_BASE_URL` на этот путь и `CLOUDFLARE_API_TOKEN` в ключ).',
    'Дальше путь такой же, как в API Cloudflare, но начинается с `/accounts/<номер>`, и этот',
    'номер — наш: чужой аккаунт закрыт. Разрешено: `workers/scripts`, `workers/services` и',
    '`workers/workers` — код бота, `workers/durable_objects/namespaces` — хранилище сообщений,',
    '`d1/database` — база. Имя любого создаваемого ресурса обязано начинаться с начала имени',
    'компании строчными (`comp-<номер>-`), поэтому чужой воркер того же аккаунта недоступен.',
    'Перечисления закрыты: обращайся к своим ресурсам по имени. Список самих методов — в',
    'документации Cloudflare (https://developers.cloudflare.com/llms.txt).',
  ].join(' '),
  responses: {
    200: { description: 'Ответ платформы как есть.' },
    400: badRequest,
    403: forbidden,
    503: { description: 'Доступ к платформе не настроен.' },
  },
};

/** Методы, которыми пользуются у платформы: путь и метод такие же, как у Cloudflare. */
const PROXY_METHODS = ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'] as const;

/** Прокси к платформе: ключ аккаунта наш, наружу уходит только ответ платформы. */
const proxy = async (c: Context) => {
  if (config.cloudflareToken === '' || config.cloudflareAccount === '') {
    return problem(c, 503, 'unavailable', 'доступ к Cloudflare не настроен');
  }

  const key = keyOf(c);
  if (key === undefined) return problem(c, 403, 'forbidden', 'чужой ключ');

  const facts = await verifiedKeyOf(key);
  if (facts === undefined) return problem(c, 403, 'forbidden', 'чужой ключ');

  // Номер компании — префиксный наноид вида `comp_…`; из него выходит начало имени.
  // Регистр опускаем: имена воркеров и баз у Cloudflare только строчные.
  const scope = `${facts.companyId.replace('_', '-').toLowerCase()}-`;
  const decided = await planOf(c, facts, scope);
  if (decided instanceof Response) return decided;

  const search = new URL(c.req.url).search;
  const init: RequestInit = {
    method: c.req.method,
    headers: outgoingHeaders(c.req.raw.headers),
    redirect: 'manual',
    signal: AbortSignal.timeout(DEADLINE_MS),
  };
  const body = requestBodyOf(c, decided);
  if (body !== undefined) init.body = body;

  try {
    const answer = await fetch(`${CLOUDFLARE_API}${decided.tail}${search}`, init);
    return new Response(answer.body, { status: answer.status, headers: incomingHeaders(answer.headers) });
  } catch (error) {
    log.warn('платформа не ответила', { reason: reasonOf(error), path: decided.tail });
    return problem(c, 502, 'unavailable', 'платформа не ответила');
  }
};

for (const method of PROXY_METHODS) {
  cloudflareRoutes.on(method, `${PATH_PREFIX}/:path{.*}`, describeRoute(PROXY_SPEC), proxy);
}
