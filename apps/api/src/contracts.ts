/**
 * Схемы ответов и запросов. Одно место: по ним строится описание API и на них же
 * проверяются данные на границе. Своих описаний маршруты не пишут.
 */
import { z } from 'zod';

/** Отказ по RFC 9457. Клиент ветвится по `code`, а не по тексту. */
export const problemSchema = z.object({
  type: z.string().meta({ description: 'Вид отказа.', examples: ['https://ss.erodionov.com/problems/forbidden'] }),
  title: z.string().meta({ description: 'Короткое имя отказа для человека.' }),
  status: z.number().meta({ description: 'Тот же номер, что и у ответа.' }),
  code: z
    .enum(['unauthorized', 'forbidden', 'not_found', 'bad_request', 'conflict', 'unavailable'])
    .meta({ description: 'Машинное слово для ветвления.' }),
  detail: z.string().meta({ description: 'Что именно пошло не так.' }),
  request_id: z.string().meta({ description: 'Номер запроса для поиска в журнале.' }),
});

export const userSchema = z.object({
  id: z.string().meta({ description: 'Номер человека.' }),
  email: z.string().meta({ description: 'Почта.' }),
  name: z.string().meta({ description: 'Имя.' }),
});

export const stepSchema = z.object({
  id: z.enum(['company', 'business', 'invites', 'channels']).meta({ description: 'Имя шага.' }),
  question: z.string().meta({ description: 'Сам вопрос.' }),
  kind: z.enum(['text', 'longtext', 'emails', 'channels']).meta({ description: 'Вид ответа.' }),
  required: z.boolean().meta({ description: 'Обязателен ли ответ.' }),
  hint: z.string().meta({ description: 'Подсказка в поле ответа.' }),
});

export const channelSchema = z.object({
  id: z.enum(['telegram', 'slack', 'whatsapp']).meta({ description: 'Имя мессенджера.' }),
  name: z.string().meta({ description: 'Подпись на плитке.' }),
});

export const answersSchema = z
  .object({
    company: z.string(),
    business: z.string(),
    invites: z.array(z.string()),
    channels: z.array(z.string()),
    done: z.array(z.string()),
  })
  .meta({ description: 'Ответы по имени шага и пройденные шаги.' });

export const fieldSchema = z.object({
  name: z.string().meta({ description: 'Имя столбца.' }),
  type: z.enum(['text', 'number', 'money', 'date', 'bool', 'ref']).meta({ description: 'Тип столбца.' }),
  note: z.string().meta({ description: 'Что хранит столбец.' }),
});

export const entitySchema = z.object({
  name: z.string().meta({ description: 'Имя таблицы.' }),
  purpose: z.string().meta({ description: 'Зачем она компании.' }),
  fields: z.array(fieldSchema),
});

/** Предложение таблиц: то, что вернула модель и приняла схема. */
export const proposalSchema = z.object({
  industry: z.string(),
  entities: z.array(entitySchema),
  departments: z.array(z.string()),
  use_cases: z.array(z.string()),
});

export const onboardingSchema = z.object({
  answers: answersSchema,
  proposal: proposalSchema.nullable().meta({ description: 'До первого удачного сбора — пусто.' }),
  status: z.string().meta({ description: 'Состояние: `started`, `proposal` или `done`.' }),
  companyId: z.string().nullable(),
});

export const companySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string().meta({ description: 'Состояние компании.' }),
});

export const conversationSchema = z.object({
  id: z.string(),
  source: z.literal('agent').meta({ description: 'Откуда чат.' }),
  title: z.string(),
  last_message_at: z.string().meta({ description: 'Время последнего сообщения, ISO.' }),
  messages: z.number().optional().meta({ description: 'Сколько сообщений; только в списке чатов.' }),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  author_name: z.string().nullable(),
  text: z.string(),
  sent_at: z.string(),
  /** Сырая запись сообщения: в ней лежит ход работы. Приходит с записью, поэтому лента не мигает. */
  raw: z.unknown().optional(),
});

export const miniAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable().meta({ description: 'Адрес на спрайте; до сборки — пусто.' }),
});

/** Кадр из комнаты живого потока. Вид выбирает `kind`. */
export const clientEventSchema = z.object({
  kind: z
    .enum(['proposal', 'started', 'chunk', 'titled', 'live', 'thought', 'done', 'failed', 'problem'])
    .meta({ description: 'Вид события.' }),
  proposal: z.unknown().optional(),
  conversationId: z.string().optional(),
  text: z.string().optional(),
  /** Название чата: приходит из задачи, которая его придумала. */
  title: z.string().optional(),
  reason: z.string().optional(),
  calls: z
    .array(z.object({ name: z.string(), intent: z.string() }))
    .optional()
    .meta({ description: 'Позванные инструменты: весь список хода, не прибавка.' }),
  thinking: z.boolean().optional().meta({ description: 'Сейчас думает сам агент.' }),
});

export const answerBodySchema = z.object({
  step: z.enum(['company', 'business', 'invites', 'channels']).meta({ description: 'Имя шага.' }),
  value: z.string().meta({ description: 'Ответ строкой.' }),
});

export const textBodySchema = z.object({ text: z.string().meta({ description: 'Текст сообщения.' }) });

/** Ответ на запись сообщения: номер записи нужен странице, чтобы опознать свой вопрос. */
export const writtenSchema = z.object({
  ok: z.boolean(),
  messageId: z.string().meta({ description: 'Номер записи вопроса.' }),
});

export const companyBodySchema = z.object({
  name: z.string().meta({ description: 'Название компании.' }),
  proposal: proposalSchema,
  invites: z.array(z.string()).meta({ description: 'Адреса приглашений.' }),
});

export const jobEventBodySchema = z.object({
  room: z.string().meta({ description: 'Имя комнаты.' }),
  event: clientEventSchema,
});

export const jobSchema = z.object({ jobId: z.string().meta({ description: 'Номер задачи в очереди.' }) });
export const okSchema = z.object({ ok: z.boolean() });

/**
 * Область платформы Cloudflare, которую видит кланкер. Список закрыт и расширяется
 * одной строкой; отказ перечисляет его целиком, поэтому кланкер не гадает.
 */
export const areaSchema = z
  .enum(['workers', 'durable_objects', 'd1'])
  .meta({ description: 'Область платформы: код бота, хранилище сообщений, база.' });

/** Заказ ключа доступа к платформе. */
export const keyBodySchema = z.object({
  name: z.string().min(1).meta({ description: 'Имя ключа для человека.' }),
  days: z.number().int().min(1).max(365).optional().meta({ description: 'Срок жизни, дней. По умолчанию 365.' }),
  areas: z.array(areaSchema).min(1).optional().meta({ description: 'Области платформы. По умолчанию все три.' }),
});

/** Ключ в списке: строки ключа в нём нет и не будет. */
export const keySchema = z.object({
  id: z.string().meta({ description: 'Номер ключа.' }),
  name: z.string().nullable().meta({ description: 'Имя ключа.' }),
  start: z.string().nullable().meta({ description: 'Начало строки ключа: по нему ключ узнаётся в списке.' }),
  areas: z.array(areaSchema).meta({ description: 'Области платформы.' }),
  enabled: z.boolean(),
  createdAt: z.string().meta({ description: 'Когда выдан, ISO.' }),
  lastRequest: z.string().nullable().meta({ description: 'Последнее обращение, ISO.' }),
});

/** Выданный ключ: строка приходит один раз, при выдаче. */
export const issuedKeySchema = z.object({
  id: z.string(),
  key: z.string().meta({ description: 'Строка ключа. Показывается один раз, при выдаче.' }),
  name: z.string(),
  areas: z.array(areaSchema),
});
