/**
 * Описание API. Оно не пишется руками: маршруты объявляют себя через `describeRoute`,
 * а голая страница отдаёт готовый документ и открывает его в Scalar.
 *
 * Схемы берутся из `contracts.ts` — там же, где живут виды ответов.
 */

import { Scalar } from '@scalar/hono-api-reference';
import type { Context } from 'hono';
import type { GenerateSpecOptions } from 'hono-openapi';
import { resolver } from 'hono-openapi';
import type { z } from 'zod';

import { problemSchema } from './contracts';

/** Отказ в любом виде: он одинаков на всех путях. */
export const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: resolver(problemSchema) } },
});

/** Обычный ответ: вид задаёт вызывающий маршрут. */
export const jsonResponse = (description: string, schema: z.ZodType) => ({
  description,
  content: { 'application/json': { schema: resolver(schema) } },
});

export const unauthorized = problemResponse('Нужен вход.');
export const forbidden = problemResponse('Нет доступа к чужой компании.');
export const notFound = problemResponse('Записи нет.');
export const badRequest = problemResponse('Тело запроса не принято.');
export const conflict = problemResponse('Сейчас так нельзя: например, у компании ещё нет базы.');

/**
 * Тело запроса как запись. Не разобранное тело — это отказ клиента, а не сбой
 * сервера: без этой проверки разбор падает и наружу уходит 500.
 */
export const bodyOf = async (c: Context): Promise<Record<string, unknown> | undefined> => {
  const raw = await c.req.text();
  const parsed: unknown = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null) return;
  return parsed as Record<string, unknown>;
};

/** Разбор тела: мусор даёт пустое значение, а не исключение. */
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Описание документа целиком. Порядок важен: этот список читает приложение,
 * чтобы показать страницу, — до того, как маршруты его дополнят.
 */
export const documentOf = (): Partial<GenerateSpecOptions> => ({
  // Сам документ и его страница в описание не входят: читателю API они не нужны.
  exclude: ['/openapi', '/docs'],
  documentation: {
    openapi: '3.1.0',
    info: {
      title: 's.solutions API',
      version: '0.1',
      description: [
        'Наш API. Он ведёт компанию от онбординга до чата с агентом.',
        '',
        'Корень — `/v1`. Ответы в JSON, кроме отказов: они в `application/problem+json`.',
        'Вход — печенье сессии, которое ставит better-auth на `/api/auth/*`.',
      ].join('\n'),
      license: { name: 'Proprietary', identifier: 'LicenseRef-Proprietary' },
    },
    servers: [
      { url: '{scheme}://{host}', variables: { scheme: { default: 'http' }, host: { default: 'localhost:8787' } } },
    ],
    tags: [
      { name: 'onboarding', description: 'Четыре вопроса и предложение таблиц.' },
      { name: 'companies', description: 'Компания, её база и её миниаппы.' },
      { name: 'conversations', description: 'Чаты с агентом: список, лента, живые кадры.' },
      {
        name: 'cloudflare',
        description: 'Доступ кланкера к платформе Cloudflare: ключи компаний и прокси с границей.',
      },
      { name: 'live', description: 'Живой поток: комнаты и задания от воркера.' },
      { name: 'service', description: 'Служебное.' },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'better-auth.session_token',
          description: 'Печенье сессии. Его ставит вход better-auth на `/api/auth/*`.',
        },
      },
    },
    security: [{ sessionCookie: [] }],
  },
});

/** Человеческая страница: тот же документ, показанный Scalar. */
export const docsPage = Scalar({
  url: '/openapi',
  pageTitle: 's.solutions API',
  defaultOpenAllTags: true,
});
