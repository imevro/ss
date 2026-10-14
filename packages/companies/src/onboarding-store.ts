/**
 * Запись и чтение онбординга. Строка одна на человека: онбординг у него один,
 * поэтому запись — вставка с заменой, а не набор строк.
 *
 * Зачем в базе: ответы и предложение таблиц стоят обращения к модели. Человек,
 * который обновил страницу, не должен платить за них второй раз.
 */
import { db, userOnboarding } from '@workspace/db';
import { eq } from 'drizzle-orm';

import type { CompanyProposal } from './proposal';
import { companyProposalSchema } from './proposal';
import type { OnboardingAnswers } from './steps';
import { answersOf, EMPTY_ANSWERS } from './steps';

/** Состояние онбординга у человека: чем продолжить страницу. */
export type OnboardingState = {
  readonly answers: OnboardingAnswers;
  readonly proposal: CompanyProposal | null;
  readonly status: string;
  readonly companyId: string | null;
};

const EMPTY: OnboardingState = { answers: EMPTY_ANSWERS, proposal: null, status: 'started', companyId: null };

/**
 * Предложение из хранилища. Разбираем схемой, а не приведением: испорченная
 * запись должна дать пусто, а не чужой вид, который уронит страницу.
 */
const proposalOf = (value: unknown): CompanyProposal | null => {
  const parsed = companyProposalSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
};

/** Что уже пройдено человеком. Нет строки — онбординг ещё не начат. */
export const savedOnboarding = async (userId: string): Promise<OnboardingState> => {
  const rows = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId)).limit(1);
  const row = rows[0];
  if (row === undefined) return EMPTY;
  return {
    answers: answersOf(row.answers),
    proposal: proposalOf(row.proposal),
    status: row.status,
    companyId: row.companyId,
  };
};

/** Один ответ. Записывается сразу: обновление страницы его не теряет. */
export const saveAnswers = async (userId: string, answers: OnboardingAnswers): Promise<void> => {
  await db
    .insert(userOnboarding)
    .values({ userId, answers })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { answers, updatedAt: new Date() },
    });
};

/** Предложение таблиц: сохраняется вместе с состоянием, чтобы страница его нашла. */
export const saveProposal = async (userId: string, proposal: CompanyProposal): Promise<void> => {
  await db
    .insert(userOnboarding)
    .values({ userId, proposal, status: 'proposal' })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { proposal, status: 'proposal', updatedAt: new Date() },
    });
};

/** Онбординг пройден: компания заведена, база выписывается. */
export const finishOnboarding = async (userId: string, companyId: string): Promise<void> => {
  await db
    .insert(userOnboarding)
    .values({ userId, companyId, status: 'done' })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { companyId, status: 'done', updatedAt: new Date() },
    });
};
