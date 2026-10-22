/**
 * Компании и реестр баз. Держим тут же онбординг: онбординг — это то, как
 * заводится компания, а не отдельная сущность.
 *
 * Компанию, владельца и приглашения ведёт плагин `organization` better-auth:
 * здесь только перевод наших поводов в его вызовы и обратно.
 */

import { toSlug } from '@workspace/companies';
import { db, member, organization } from '@workspace/db';
import { createLogger, messageOf } from '@workspace/log';
import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';
import { and, eq } from 'drizzle-orm';

import { auth } from './auth';

const log = createLogger('companies');

export type Company = typeof organization.$inferSelect;

export type NewCompany = {
  readonly name: string;
  readonly business: string;
  readonly headers: Headers;
  readonly invites: readonly string[];
};

/** Почему компания не заведена. Клиент ветвится по слову, а не по тексту. */
export type CompanyError = { readonly kind: 'not_created' };

/**
 * Заводит компанию, владельца и приглашения. Половина компании без владельца не
 * нужна никому, поэтому владельца ставит сам плагин в одном действии с компанией.
 *
 * Приглашение, которое плагин отверг (адрес не тот или такой уже в компании),
 * компанию не отменяет: она уже есть, и терять её из-за одного адреса нельзя.
 */
export const createCompany = async (input: NewCompany): Promise<Result<Company, CompanyError>> => {
  const made = await auth.api
    .createOrganization({
      body: { name: input.name, slug: await freeSlug(input.name), metadata: { business: input.business } },
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
    log.error('приглашение не создано', { organizationId, email, error: messageOf(error) });
  }
};

export const findCompany = async (id: string): Promise<Company | undefined> => {
  const rows = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
  return rows[0];
};

/**
 * Свободное имя для SQL. Адрес компании в адресе страницы уникален, а имя
 * компании — нет: вторая «Своя» упёрлась бы в занятый адрес. Поэтому к занятому
 * имени добавляется номер, и первое имя остаётся нетронутым.
 */
const candidateFor = (base: string, number: number): string => {
  if (number === 1) return base;
  return `${base}_${number}`;
};

const slugTaken = async (candidate: string): Promise<boolean> => {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, candidate))
    .limit(1);
  return rows.length > 0;
};

const freeFrom = async (base: string, number: number): Promise<string> => {
  if (number > 99) throw new Error(`не нашлось свободного адреса для «${base}»`);
  const candidate = candidateFor(base, number);
  if (!(await slugTaken(candidate))) return candidate;
  return freeFrom(base, number + 1);
};

export const freeSlug = (name: string): Promise<string> => freeFrom(toSlug(name), 1);

/** Компании человека: по ним строится вход. Членство читаем из таблицы плагина. */
export const companiesOf = async (userId: string): Promise<readonly Company[]> =>
  db
    .select({ company: organization })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.status, 'active')))
    .then((rows) => rows.map((row) => row.company));

/**
 * Членство: номер компании принадлежит человеку? Один запрос вместо чтения всех компаний
 * с последующим перебором — так спрашивают все маршруты с номером компании в адресе.
 */
export const isMemberOf = async (userId: string, companyId: string): Promise<boolean> =>
  db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, companyId), eq(member.status, 'active')))
    .limit(1)
    .then((rows) => rows.length > 0);
