/**
 * Ядро продукта: кто есть кто, какая база выписана какой компании.
 * Данные компаний тут не лежат — они в базе компании (см. docs/architecture.md §2).
 */
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('owner'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('memberships_company_user').on(t.companyId, t.userId)],
)

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Реестр выписанных баз: единственный источник правды о том, у кого какая база. */
export const companyDatabases = pgTable(
  'company_databases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    dbName: text('db_name').notNull().unique(),
    roles: jsonb('roles').notNull(),
    cluster: text('cluster').notNull().default('local'),
    status: text('status').notNull().default('provisioning'),
    provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    droppedAt: timestamp('dropped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('company_databases_company').on(t.companyId)],
)

/** Сессия агента: связка беседы с процессом gentic. Ключ сессии живёт у gentic. */
export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull(),
    agent: text('agent').notNull().default('company'),
    genticKey: text('gentic_key').notNull(),
    status: text('status').notNull().default('idle'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_sessions_company_conversation').on(t.companyId, t.conversationId)],
)

/** Опубликованный миниапп: спрайт, адрес и токен на чтение данных. */
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    source: jsonb('source').notNull().default({}),
    sprite: jsonb('sprite'),
    url: text('url'),
    tokenHash: text('token_hash'),
    visibility: text('visibility').notNull().default('company'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('apps_company').on(t.companyId)],
)

/** Журнал: кто что сделал. Пишем с первого дня, даже когда читать нечем. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    actorKind: text('actor_kind').notNull().default('user'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    meta: jsonb('meta').notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_company_at').on(t.companyId, t.at)],
)

export const flags = pgTable('flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  key: text('key').notNull(),
  value: boolean('value').notNull().default(false),
})
