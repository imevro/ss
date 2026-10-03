/**
 * Выписка базы компании. Здесь только сборка плана: тексты запросов и имена.
 * Выполняет его воркер, потому что создание базы — это ввод-вывод.
 *
 * Инварианты: имена только [a-z0-9_], любое имя в кавычках, чужие схемы закрыты.
 */

import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';

import type { CompanyProposal } from './proposal';

/** Русские буквы в именах баз и ролей недопустимы: переводим в латиницу. */
const TRANSLIT: ReadonlyMap<string, string> = new Map(
  'а=a|б=b|в=v|г=g|д=d|е=e|ё=e|ж=zh|з=z|и=i|й=y|к=k|л=l|м=m|н=n|о=o|п=p|р=r|с=s|т=t|у=u|ф=f|х=h|ц=c|ч=ch|ш=sh|щ=sch|ъ=|ы=y|ь=|э=e|ю=yu|я=ya'
    .split('|')
    .map((pair) => {
      const [from = '', to = ''] = pair.split('=');
      return [from, to] as const;
    }),
);

const latin = (name: string): string =>
  name
    .toLowerCase()
    .split('')
    .map((symbol) => {
      const mapped = TRANSLIT.get(symbol);
      if (mapped === undefined) return symbol;
      return mapped;
    })
    .join('');

/** Имя для SQL: строчные буквы, цифры, подчёркивания. Нужно таблицам, ролям и базам. */
export const toSlug = (name: string): string => {
  const slug = latin(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (slug === '') throw new Error(`из имени «${name}» не выходит имя для SQL`);
  return slug;
};

export type ColumnType = CompanyProposal['entities'][number]['fields'][number]['type'];

export type TenantColumn = { readonly name: string; readonly type: ColumnType; readonly note: string };

export type TenantTable = {
  readonly name: string;
  readonly purpose: string;
  readonly columns: readonly TenantColumn[];
};

export type TenantPasswords = { readonly ro: string; readonly rw: string; readonly ddl: string };

export type ProvisionInput = {
  readonly slug: string;
  readonly proposal: CompanyProposal;
  readonly passwords: TenantPasswords;
};

export type ProvisionPlan = {
  readonly dbName: string;
  readonly roles: { readonly ro: string; readonly rw: string; readonly ddl: string };
  readonly tables: readonly TenantTable[];
  /** Заведение базы. Отдельно от прочего: по нему решают, что убирать при отказе. */
  readonly createDatabase: string;
  readonly roleStatements: readonly string[];
  /** Запросы внутри новой базы. */
  readonly databaseStatements: readonly string[];
};

export type ProvisionError =
  | { readonly kind: 'bad_slug'; readonly slug: string }
  | { readonly kind: 'bad_name'; readonly name: string }
  | { readonly kind: 'no_entities' };

/** Тип столбца компании → тип Postgres. Деньги — numeric, не float: округление денег обязано быть точным. */
const SQL_TYPE: Record<ColumnType, string> = {
  text: 'text',
  number: 'numeric',
  money: 'numeric(14, 2)',
  date: 'timestamptz',
  bool: 'boolean',
  ref: 'text',
};

const IDENT = /^[a-z][a-z0-9_]{0,40}$/;

/** Имя в кавычках. Всё, что прошло проверку, безопасно; непроверенное сюда не попадает. */
const q = (name: string): string => `"${name}"`;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Схема контекста: наши представления над перепиской. Компания читает, но не пишет. */
const ctxTables = (): readonly string[] => [
  `CREATE TABLE IF NOT EXISTS ctx.conversations (
     id text PRIMARY KEY,
     source text NOT NULL,
     external_id text,
     title text NOT NULL,
     agent text,
     created_at timestamptz NOT NULL DEFAULT now(),
     last_message_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS ctx.messages (
     id text PRIMARY KEY,
     conversation_id text NOT NULL REFERENCES ctx.conversations(id) ON DELETE CASCADE,
     role text NOT NULL,
     author_name text,
     text text NOT NULL,
     sent_at timestamptz NOT NULL DEFAULT now(),
     external_id text,
     raw jsonb NOT NULL DEFAULT '{}'::jsonb
   )`,
  'CREATE INDEX IF NOT EXISTS ctx_messages_conversation_idx ON ctx.messages (conversation_id, sent_at)',
  // Повторная доставка телеграма спотыкается об этот ключ: дублей в ленте нет.
  'CREATE UNIQUE INDEX IF NOT EXISTS ctx_messages_external_idx ON ctx.messages (conversation_id, external_id)',
];

/** Журнал правок схемы: что и когда применено к базе компании. */
const migrationsTable = (): string =>
  `CREATE TABLE IF NOT EXISTS app._migrations (
     id text PRIMARY KEY,
     applied_at timestamptz NOT NULL DEFAULT now()
   )`;

const tableStatement = (table: TenantTable): string => {
  const columns = table.columns.map((column) => `  ${q(column.name)} ${SQL_TYPE[column.type]}`).join(',\n');
  return `CREATE TABLE IF NOT EXISTS app.${q(table.name)} (
${columns}
)`;
};

export const planProvision = (input: ProvisionInput): Result<ProvisionPlan, ProvisionError> => {
  if (!IDENT.test(input.slug)) return err({ kind: 'bad_slug', slug: input.slug });
  if (input.proposal.entities.length === 0) return err({ kind: 'no_entities' });

  // Имена таблиц и столбцов приводим к безопасному виду; после приведения проверяем
  // ещё раз, потому что toSlug может вернуть пустое имя для нечитаемого входа.
  const tables = input.proposal.entities.map((entity) => ({
    name: toSlug(entity.name),
    purpose: entity.purpose,
    columns: entity.fields.map((field) => ({ name: toSlug(field.name), type: field.type, note: field.note })),
  }));
  const badName = tables
    .flatMap((table) => [table.name, ...table.columns.map((column) => column.name)])
    .find((name) => !IDENT.test(name));
  if (badName !== undefined) return err({ kind: 'bad_name', name: badName });

  const dbName = `ss_${input.slug}`;
  const roles = {
    ro: `${input.slug}_agent_ro`,
    rw: `${input.slug}_agent_rw`,
    ddl: `${input.slug}_agent_ddl`,
  };

  const roleStatement = (role: string, password: string): string =>
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quote(role)}) THEN
         CREATE ROLE ${q(role)} LOGIN PASSWORD ${quote(password)};
       END IF;
     END $$`;

  /** Роль видит схемы своей компании без уточнения схемы: app для работы, ctx для чтения переписки. */
  const searchPath = (role: string): string => `ALTER ROLE ${q(role)} SET search_path TO app, ctx`;

  const createDatabase = `CREATE DATABASE ${q(dbName)}`;
  const roleStatements = [
    roleStatement(roles.ro, input.passwords.ro),
    roleStatement(roles.rw, input.passwords.rw),
    roleStatement(roles.ddl, input.passwords.ddl),
    searchPath(roles.ro),
    searchPath(roles.rw),
    searchPath(roles.ddl),
  ];

  const databaseStatements = [
    // Чужим входа в схемы нет: право выдаём только трём ролям компании.
    'REVOKE ALL ON SCHEMA public FROM PUBLIC',
    'CREATE SCHEMA IF NOT EXISTS app',
    'CREATE SCHEMA IF NOT EXISTS ctx',
    ...ctxTables(),
    migrationsTable(),
    ...tables.map(tableStatement),
    `GRANT USAGE ON SCHEMA ctx TO ${q(roles.ro)}, ${q(roles.rw)}, ${q(roles.ddl)}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA ctx TO ${q(roles.ro)}, ${q(roles.rw)}, ${q(roles.ddl)}`,
    `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ctx FROM ${q(roles.ro)}, ${q(roles.rw)}, ${q(roles.ddl)}`,
    `GRANT USAGE ON SCHEMA app TO ${q(roles.ro)}, ${q(roles.rw)}, ${q(roles.ddl)}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA app TO ${q(roles.ro)}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${q(roles.rw)}`,
    `GRANT ALL ON SCHEMA app TO ${q(roles.ddl)}`,
    // Таблицы, которые появятся позже, получают те же права.
    `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO ${q(roles.ro)}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${q(roles.rw)}`,
  ];

  return ok({ dbName, roles, tables, createDatabase, roleStatements, databaseStatements });
};
