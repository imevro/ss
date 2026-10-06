/**
 * Компании и реестр баз. Держим тут же онбординг: онбординг — это то, как
 * заводится компания, а не отдельная сущность.
 *
 * Компанию, владельца и приглашения ведёт плагин `organization` better-auth:
 * здесь только перевод наших поводов в его вызовы и обратно.
 */

import type { CompanyProposal } from '@workspace/companies';
import { acceptProposal, toSlug } from '@workspace/companies';
import { companyDatabases, db, member, organization } from '@workspace/db';
import { createLogger, messageOf } from '@workspace/log';
import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';
import { and, eq } from 'drizzle-orm';

import { auth } from './auth';

const log = createLogger('companies');

export type Company = typeof organization.$inferSelect;
export type CompanyDatabase = typeof companyDatabases.$inferSelect;

export type NewCompany = {
  readonly name: string;
  readonly headers: Headers;
  readonly proposal: unknown;
  readonly invites: readonly string[];
};

/** Почему компания не заведена. Клиент ветвится по слову, а не по тексту. */
export type CompanyError = { readonly kind: 'bad_proposal' | 'not_created' };

/**
 * Заводит компанию, владельца и приглашения. Половина компании без владельца не
 * нужна никому, поэтому владельца ставит сам плагин в одном действии с компанией.
 *
 * Приглашение, которое плагин отверг (адрес не тот или такой уже в компании),
 * компанию не отменяет: она уже есть, и терять её из-за одного адреса нельзя.
 */
export const createCompany = async (input: NewCompany): Promise<Result<Company, CompanyError>> => {
  const accepted = acceptProposal(input.proposal);
  if (!accepted.ok) return err({ kind: 'bad_proposal' });
  const proposal: CompanyProposal = accepted.value;

  const made = await auth.api
    .createOrganization({
      body: { name: input.name, slug: toSlug(input.name), metadata: { proposal } },
      headers: input.headers,
    })
    .catch((error: unknown): undefined => {
      log.error('компания не заведена', { name: input.name, error: messageOf(error) });
    });
  if (made === undefined) return err({ kind: 'not_created' });

  const company = await findCompany(made.id);
  if (company === undefined) return err({ kind: 'not_created' });

  await Promise.all(input.invites.map((email) => inviteTo(company.id, email, input.headers)));

  log.info('компания создана', { companyId: company.id, slug: company.slug });
  return ok(company);
};

/** Приглашение через плагин: он же ведёт срок годности и повторы. */
const inviteTo = async (organizationId: string, email: string, headers: Headers): Promise<void> => {
  try {
    await auth.api.createInvitation({ body: { email, role: 'member', organizationId }, headers });
  } catch (error) {
    log.warn('приглашение не создано', { organizationId, email, error: messageOf(error) });
  }
};

export const findCompany = async (id: string): Promise<Company | undefined> => {
  const rows = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
  return rows[0];
};

/** Компании человека: по ним строится вход. Членство читаем из таблицы плагина. */
export const companiesOf = async (userId: string): Promise<readonly Company[]> =>
  db
    .select({ company: organization })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.status, 'active')))
    .then((rows) => rows.map((row) => row.company));

export const databaseOf = async (companyId: string): Promise<CompanyDatabase | undefined> => {
  const rows = await db.select().from(companyDatabases).where(eq(companyDatabases.companyId, companyId)).limit(1);
  return rows[0];
};
