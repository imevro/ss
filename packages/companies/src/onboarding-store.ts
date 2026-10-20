/**
 * Запись и чтение онбординга. Строка одна на человека: онбординг у него один,
 * поэтому запись — вставка с заменой, а не набор строк.
 *
 * Зачем в базе: человек, который обновил страницу, продолжает с того же места.
 */
import { db, userOnboarding } from '@workspace/db';
import { eq } from 'drizzle-orm';

import type { OnboardingAnswers } from './steps';
import { answersOf, EMPTY_ANSWERS } from './steps';

/** Состояние онбординга у человека: чем продолжить страницу. */
export type OnboardingState = {
  readonly answers: OnboardingAnswers;
  readonly status: string;
  readonly companyId: string | null;
};

const EMPTY: OnboardingState = { answers: EMPTY_ANSWERS, status: 'started', companyId: null };

/** Что уже пройдено человеком. Нет строки — онбординг ещё не начат. */
export const savedOnboarding = async (userId: string): Promise<OnboardingState> => {
  const rows = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId)).limit(1);
  const row = rows[0];
  if (row === undefined) return EMPTY;
  return {
    answers: answersOf(row.answers),
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
