/**
 * Компании и реестр баз. Держим тут же онбординг: онбординг — это то, как
 * заводится компания, а не отдельная сущность.
 */

import type { CompanyProposal } from '@workspace/companies';
import { acceptProposal, toSlug } from '@workspace/companies';
import { companies, companyDatabases, db, invites, memberships, newId } from '@workspace/db';
import { createLogger } from '@workspace/log';
import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';
import { and, eq } from 'drizzle-orm';

const log = createLogger('companies');

export type Company = typeof companies.$inferSelect;
export type CompanyDatabase = typeof companyDatabases.$inferSelect;

export type NewCompany = {
  readonly name: string;
  readonly ownerId: string;
  readonly proposal: unknown;
  readonly invites: readonly string[];
};

/** Почему компания не заведена. Клиент ветвится по слову, а не по тексту. */
export type CompanyError = { readonly kind: 'bad_proposal' | 'not_created' };

/**
 * Заводит компанию, владельца и приглашения одной записью. Половина компании
 * без владельца не нужна никому, поэтому все три части идут вместе.
 */
export const createCompany = async (input: NewCompany): Promise<Result<Company, CompanyError>> => {
  const accepted = acceptProposal(input.proposal);
  if (!accepted.ok) return err({ kind: 'bad_proposal' });
  const proposal: CompanyProposal = accepted.value;

  const company = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(companies)
      .values({ name: input.name, slug: toSlug(input.name), settings: { proposal } })
      .returning();
    const made = rows[0];
    if (made === undefined) return;

    await tx.insert(memberships).values({ companyId: made.id, userId: input.ownerId, role: 'owner' });

    if (input.invites.length > 0) {
      const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
      await tx.insert(invites).values(
        input.invites.map((email) => ({
          companyId: made.id,
          email,
          token: newId('invite'),
          expiresAt,
        })),
      );
    }
    return made;
  });
  if (company === undefined) return err({ kind: 'not_created' });

  log.info('компания создана', { companyId: company.id, slug: company.slug });
  return ok(company);
};

export const findCompany = async (id: string): Promise<Company | undefined> => {
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0];
};

/** Компании человека: по ним строится вход. */
export const companiesOf = async (userId: string): Promise<readonly Company[]> =>
  db
    .select({ company: companies })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
    .then((rows) => rows.map((row) => row.company));

export const databaseOf = async (companyId: string): Promise<CompanyDatabase | undefined> => {
  const rows = await db.select().from(companyDatabases).where(eq(companyDatabases.companyId, companyId)).limit(1);
  return rows[0];
};
