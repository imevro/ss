/**
 * Онбординг: три детерминированных вопроса. Модель в нём не участвует: ответы
 * сохраняются, компания заводится сразу после последнего вопроса.
 *
 * Вид один на весь API: `/v1/...`, множественное число, отказы по одному образцу.
 * Описание каждого маршрута стоит рядом с ним: документ собирается из кода.
 */
import type { OnboardingStep } from '@workspace/companies';
import { finishOnboarding, ONBOARDING_STEPS, putAnswer, saveAnswers, savedOnboarding } from '@workspace/companies';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';

import { auth } from './auth';
import { createCompany, databaseOf, findCompany, isMemberOf } from './companies';
import {
  answerBodySchema,
  companyBodySchema,
  companySchema,
  jobSchema,
  onboardingSchema,
  stepSchema,
} from './contracts';
import { badRequest, bodyOf, conflict, forbidden, jsonResponse, notFound, unauthorized } from './docs';
import { problem } from './problem';
import { enqueue } from './queue';

export const onboarding = new Hono();

/** Шаги онбординга. Их задаёт ядро, интерфейс только показывает. */
onboarding.get(
  '/v1/onboarding/steps',
  describeRoute({
    tags: ['onboarding'],
    summary: 'Вопросы онбординга',
    responses: {
      200: jsonResponse('Вопросы.', z.object({ steps: z.array(stepSchema) })),
      401: unauthorized,
    },
  }),
  async (c) => {
    // Шаги видит только вошедший: онбординг — часть входа, а не витрина.
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');
    return c.json({ steps: ONBOARDING_STEPS });
  },
);

/** Что человек уже прошёл. Страница продолжает с этого места, а не с начала. */
onboarding.get(
  '/v1/onboarding',
  describeRoute({
    tags: ['onboarding'],
    summary: 'Что человек уже прошёл',
    responses: {
      200: jsonResponse('Состояние онбординга.', z.object({ onboarding: onboardingSchema })),
      401: unauthorized,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');
    return c.json({ onboarding: await savedOnboarding(session.user.id) });
  },
);

/**
 * Ответ на шаг. Приходит именем шага, а не местом в списке: добавленный вопрос
 * не сдвигает соседние ответы. Проверяет ответ ядро, здесь только запись.
 */
onboarding.put(
  '/v1/onboarding/answers',
  describeRoute({
    tags: ['onboarding'],
    summary: 'Ответить на шаг',
    requestBody: { content: { 'application/json': { schema: resolver(answerBodySchema) } } },
    responses: {
      200: jsonResponse('Ответ записан.', z.object({ onboarding: onboardingSchema })),
      400: badRequest,
      401: unauthorized,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const body = await bodyOf(c);
    if (body === undefined) return problem(c, 400, 'bad_request', 'не понимаю запрос');
    const asked = answerOf(body);
    if (asked === undefined) return problem(c, 400, 'bad_request', 'нужны имя шага и значение');
    const saved = await savedOnboarding(session.user.id);
    const next = putAnswer(saved.answers, asked.step, asked.value);
    if (!next.ok) return problem(c, 400, 'bad_request', explain(next.error));

    await saveAnswers(session.user.id, next.value);
    return c.json({ onboarding: { ...saved, answers: next.value } });
  },
);

/** Создание компании. Владелец — тот, кто вошёл. */
onboarding.post(
  '/v1/companies',
  describeRoute({
    tags: ['companies'],
    summary: 'Завести компанию',
    requestBody: { content: { 'application/json': { schema: resolver(companyBodySchema) } } },
    responses: {
      201: jsonResponse('Компания заведена.', z.object({ company: companySchema })),
      400: badRequest,
      401: unauthorized,
    },
  }),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return problem(c, 401, 'unauthorized', 'нужен вход');

    const body = await bodyOf(c);
    if (body === undefined) return problem(c, 400, 'bad_request', 'не понимаю запрос');
    const parsed = newCompanyOf(body);
    if (parsed === undefined) return problem(c, 400, 'bad_request', 'нужно название компании');

    const created = await createCompany({ ...parsed, headers: c.req.raw.headers });
    // Пустая вставка — сбой сервера: говорить «твой запрос плох» тут значило бы соврать.
    if (!created.ok) return problem(c, 503, 'unavailable', 'компания не заведена');
    await finishOnboarding(session.user.id, created.value.id);
    return c.json({ company: created.value }, 201);
  },
);

/** Выписка базы компании. Работу выполняет воркер: тут только постановка. */
onboarding.post(
  '/v1/companies/:id/database',
  describeRoute({
    tags: ['companies'],
    summary: 'Выписать базу компании',
    responses: {
      202: jsonResponse('Задача поставлена.', jobSchema),
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
    // База выписывается только своей компании: чужой номер сюда не проходит.
    if (!(await isMemberOf(session.user.id, companyId))) return problem(c, 403, 'forbidden', 'чужая компания');
    // Компания есть — иначе это чужой номер. База уже выписана — повтор не нужен:
    // сама запись о базе появляется только после работы воркера.
    if ((await findCompany(companyId)) === undefined) return problem(c, 404, 'not_found', 'компании нет');
    if ((await databaseOf(companyId)) !== undefined) return problem(c, 409, 'conflict', 'база уже выписана');

    const jobId = await enqueue('db:provision', { companyId }, `db:provision:${companyId}`);
    return c.json({ jobId }, 202);
  },
);

type Answer = { readonly step: OnboardingStep; readonly value: string };

/** Ответ в запросе: имя шага и значение. Чужое имя шага не принимаем. */
const answerOf = (body: unknown): Answer | undefined => {
  if (typeof body !== 'object' || body === null) return;
  const record = body as Record<string, unknown>;
  const step = ONBOARDING_STEPS.find((known) => known.id === record.step);
  if (step === undefined) return;
  const value = record.value;
  if (typeof value !== 'string') return;
  return { step, value };
};

/** Что сказать человеку о непринятом ответе. */
const explain = (error: { readonly kind: string; readonly value?: string }): string => {
  const wrong = error.value;
  if (error.kind === 'empty') return 'ответ пустой';
  if (error.kind === 'bad_email') return `адрес не понят: ${wrong}`;
  if (error.kind === 'bad_name') return 'название начинается со знака — так не бывает';
  return 'ответ не принят';
};

type NewCompanyInput = {
  readonly name: string;
  readonly business: string;
  readonly invites: readonly string[];
};

const asStringList = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

/** Текст из тела запроса: не строка — значит не прислали. */
const textOf = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const newCompanyOf = (body: unknown): NewCompanyInput | undefined => {
  if (typeof body !== 'object' || body === null) return;
  const record = body as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== 'string' || name.trim() === '') return;
  return { name: name.trim(), business: textOf(record.business), invites: asStringList(record.invites) };
};
