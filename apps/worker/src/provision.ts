/**
 * Выписка базы компании. Исполняет план из @workspace/companies — там только имена и тексты
 * запросов, здесь ввод-вывод.
 *
 * Создание базы идёт из служебной базы кластера, остальное — уже внутри новой базы.
 */

import { randomBytes } from 'node:crypto';

import type { CompanyProposal } from '@workspace/companies';
import { companyProposalSchema, planProvision } from '@workspace/companies';
import { companies, companyDatabases, db } from '@workspace/db';
import { createLogger, logStep, messageOf } from '@workspace/log';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';

import { config } from './env';

const log = createLogger('db:provision');

export type ProvisionResult =
  | { readonly status: 'ready'; readonly dbName: string }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };

/** Адрес служебной базы для CREATE DATABASE. Отдельный от рабочей строки. */
const adminUrl = (coreUrl: string): string => {
  const url = new URL(coreUrl);
  url.pathname = '/postgres';
  return url.toString();
};

const withDatabase = (coreUrl: string, dbName: string): string => {
  const url = new URL(coreUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
};

const password = (): string => randomBytes(24).toString('base64url');

const noop = (): void => undefined;

const readProposal = (settings: unknown): CompanyProposal | undefined => {
  if (typeof settings !== 'object' || settings === null) return;
  const raw = (settings as Record<string, unknown>).proposal;
  const parsed = companyProposalSchema.safeParse(raw);
  if (!parsed.success) return;
  return parsed.data;
};

export const provisionCompanyDatabase = async (data: { readonly companyId: string }): Promise<ProvisionResult> => {
  const step = await logStep.start({
    ctx: { runId: `provision:${data.companyId}`, companyId: data.companyId, agent: 'db:provision' },
    toolName: 'db:provision',
    explanation: 'выписываю базу компании',
    input: data,
  });

  const rows = await db.select().from(companies).where(eq(companies.id, data.companyId)).limit(1);
  const company = rows[0];
  if (company === undefined) {
    const reason = `компания ${data.companyId} не найдена`;
    await step.finish({ output: reason, kind: 'error' });
    return { status: 'failed', reason };
  }

  const existing = await db.select().from(companyDatabases).where(eq(companyDatabases.companyId, company.id)).limit(1);
  if (existing[0] !== undefined) {
    await step.finish({ output: { dbName: existing[0].dbName }, explanation: 'база уже выписана' });
    return { status: 'skipped', reason: 'база уже выписана' };
  }

  const proposal = readProposal(company.settings);
  if (proposal === undefined) {
    const reason = 'у компании нет предложения по таблицам';
    await step.finish({ output: reason, kind: 'error' });
    return { status: 'failed', reason };
  }

  const creds = { ro: password(), rw: password(), ddl: password() };
  const planned = planProvision({ slug: company.slug, proposal, passwords: creds });
  if (!planned.ok) {
    const reason = JSON.stringify(planned.error);
    await step.finish({ output: reason, kind: 'error' });
    return { status: 'failed', reason };
  }
  const plan = planned.value;

  const cluster = postgres(adminUrl(config.databaseUrl), { max: 1 });
  const tenant = postgres(withDatabase(config.databaseUrl, plan.dbName), { max: 1 });

  /** Уборка за собой: годятся только имена из плана, они проверены. */
  const dropOwnDatabase = async (): Promise<void> => {
    await cluster.unsafe(`DROP DATABASE IF EXISTS ${plan.dbName} WITH (FORCE)`).catch(noop);
    await Promise.all(
      [plan.roles.ro, plan.roles.rw, plan.roles.ddl].map((role) =>
        cluster.unsafe(`DROP ROLE IF EXISTS ${role}`).catch(noop),
      ),
    );
  };

  try {
    // База заводится отдельным шагом и первой. Если она уже есть, имя занято чужим
    // прогоном: тогда мы не трогаем ничего — ни базу, ни роли, ни записи.
    await cluster.unsafe(plan.createDatabase);
  } catch (error) {
    const reason = `база ${plan.dbName} не заведена: ${messageOf(error)}`;
    await step.finish({ output: reason, kind: 'error' });
    log.error('выписка не удалась', { companyId: company.id, dbName: plan.dbName, error: reason });
    await cluster.end();
    await tenant.end();
    return { status: 'failed', reason };
  }

  try {
    for (const statement of plan.roleStatements) await cluster.unsafe(statement);
    for (const statement of plan.databaseStatements) await tenant.unsafe(statement);

    // Пароли ролей лежат в записи реестра: читать их будет только агент компании.
    await db.insert(companyDatabases).values({
      companyId: company.id,
      dbName: plan.dbName,
      roles: { names: plan.roles, passwords: { ro: creds.ro, rw: creds.rw, ddl: creds.ddl } },
      cluster: 'local',
      status: 'ready',
      provisionedAt: new Date(),
    });

    await step.finish({
      output: { dbName: plan.dbName, tables: plan.tables.map((table) => table.name) },
      explanation: `база ${plan.dbName} выписана`,
    });
    log.info('база выписана', { companyId: company.id, dbName: plan.dbName, tables: plan.tables.length });
    return { status: 'ready', dbName: plan.dbName };
  } catch (error) {
    // База появилась в этом прогоне — значит она наша и половину её оставлять нельзя.
    await dropOwnDatabase();
    const reason = messageOf(error);
    await step.finish({ output: reason, kind: 'error' });
    log.error('выписка не удалась', { companyId: company.id, dbName: plan.dbName, error: reason });
    return { status: 'failed', reason };
  } finally {
    await cluster.end();
    await tenant.end();
  }
};
