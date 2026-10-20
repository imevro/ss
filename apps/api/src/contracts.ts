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
  id: z.enum(['company', 'business', 'invites']).meta({ description: 'Имя шага.' }),
  question: z.string().meta({ description: 'Сам вопрос.' }),
  kind: z.enum(['text', 'longtext', 'emails']).meta({ description: 'Вид ответа.' }),
  required: z.boolean().meta({ description: 'Обязателен ли ответ.' }),
  hint: z.string().meta({ description: 'Подсказка в поле ответа.' }),
});

export const answersSchema = z
  .object({
    company: z.string(),
    business: z.string(),
    invites: z.array(z.string()),
    done: z.array(z.string()),
  })
  .meta({ description: 'Ответы по имени шага и пройденные шаги.' });

export const onboardingSchema = z.object({
  answers: answersSchema,
  status: z.string().meta({ description: 'Состояние: `started` или `done`.' }),
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

/** Позванный инструмент: имя и замысел. Вид один с показывающим. */
const toolCallSchema = z.object({ name: z.string(), intent: z.string() });

/**
 * Кадр из комнаты живого потока. Вид выбирает `kind`, и у каждого вида свои поля:
 * разбор обязан дать ровно тот вид, что объявлен у клиента. Кадр без поля — это
 * не «пусто», а испорченный кадр: его отбрасываем, а не подставляем пустое.
 */
export const clientEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('started'),
    conversationId: z.string(),
    messageId: z.string().optional().meta({ description: 'Номер записи ответа.' }),
  }),
  z.object({ kind: z.literal('chunk'), conversationId: z.string(), text: z.string() }),
  z.object({
    kind: z.literal('titled'),
    conversationId: z.string(),
    /** Название чата: приходит из задачи, которая его придумала. */
    title: z.string(),
  }),
  z.object({
    kind: z.literal('live'),
    conversationId: z.string(),
    calls: z.array(toolCallSchema).meta({ description: 'Позванные инструменты: весь список хода, не прибавка.' }),
    thinking: z.boolean().meta({ description: 'Сейчас думает сам агент.' }),
  }),
  z.object({ kind: z.literal('thought'), conversationId: z.string() }),
  z.object({
    kind: z.literal('log'),
    conversationId: z.string(),
    line: z.string().meta({ description: 'Строка из потока ошибок агента.' }),
  }),
  z.object({
    kind: z.literal('done'),
    conversationId: z.string(),
    messageId: z.string().optional().meta({ description: 'Номер записи ответа.' }),
  }),
  z.object({ kind: z.literal('failed'), conversationId: z.string(), reason: z.string() }),
  z.object({ kind: z.literal('problem'), reason: z.string() }),
]);

export const answerBodySchema = z.object({
  step: z.enum(['company', 'business', 'invites']).meta({ description: 'Имя шага.' }),
  value: z.string().meta({ description: 'Ответ строкой.' }),
});

export const textBodySchema = z.object({ text: z.string().meta({ description: 'Текст сообщения.' }) });

/** Тело сообщения в чат. Признак `interrupt` пускает вопрос вне очереди. */
export const messageBodySchema = z.object({
  text: z.string().meta({ description: 'Текст сообщения.' }),
  interrupt: z.boolean().optional().meta({ description: 'Пустить вопрос сейчас: идущий ход чата останавливается.' }),
});

/** Ответ на запись сообщения: номер записи нужен странице, чтобы опознать свой вопрос. */
export const writtenSchema = z.object({
  ok: z.boolean(),
  messageId: z.string().meta({ description: 'Номер записи вопроса.' }),
});

export const companyBodySchema = z.object({
  name: z.string().meta({ description: 'Название компании.' }),
  business: z.string().meta({ description: 'Чем занимается компания.' }),
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
export const AREAS = ['workers', 'durable_objects', 'd1'] as const;

/** Предел срока жизни ключа в днях: тот же предел у проверки тела, что и у описания. */
export const MAX_DAYS = 365;

export const areaSchema = z
  .enum(AREAS)
  .meta({ description: 'Область платформы: код бота, хранилище сообщений, база.' });

/** Заказ ключа доступа к платформе. */
export const keyBodySchema = z.object({
  name: z.string().min(1).meta({ description: 'Имя ключа для человека.' }),
  days: z.number().int().min(1).max(MAX_DAYS).optional().meta({ description: 'Срок жизни, дней. По умолчанию 365.' }),
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
  expiresAt: z.string().nullable().meta({ description: 'До какого времени ключ годен, ISO. Пусто — бессрочный.' }),
});

/** Выданный ключ: строка приходит один раз, при выдаче. */
export const issuedKeySchema = z.object({
  id: z.string(),
  key: z.string().meta({ description: 'Строка ключа. Показывается один раз, при выдаче.' }),
  name: z.string(),
  areas: z.array(areaSchema),
});
