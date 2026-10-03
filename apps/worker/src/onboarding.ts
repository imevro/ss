/**
 * Сбор предложения таблиц: модель зовут из очереди, а не из запроса человека.
 * Готовое предложение ложится в онбординг — страница найдёт его при обновлении.
 */
import { companyProposal, saveProposal } from '@workspace/companies';
import { createLogger } from '@workspace/log';
import { onboardingRoom } from '@workspace/types';

import { config } from './env';
import { tell } from './tell';

const log = createLogger('onboarding.proposal');

export type ProposalJob = { readonly userId: string; readonly business: string };

/** Комната человека, который ждёт предложение. */
const roomOf = (userId: string): string => onboardingRoom(userId);

/** Собрать предложение и сохранить. Провал не роняет воркер: он пишет в журнал. */
export const proposeFor = async (job: ProposalJob): Promise<{ readonly status: 'ok' | 'failed' }> => {
  const proposed = await companyProposal(job.business, {
    baseURL: config.llmBaseUrl,
    apiKey: config.llmApiKey,
    model: config.llmModel,
  });
  if (!proposed.ok) {
    log.error('предложение не собрано', { user: job.userId, error: proposed.error });
    await tell(roomOf(job.userId), { kind: 'problem', reason: 'модель не ответила' });
    return { status: 'failed' };
  }
  await saveProposal(job.userId, proposed.value);
  // Страница не спрашивает «готово ли»: предложение само приходит в её комнату.
  await tell(roomOf(job.userId), { kind: 'proposal', proposal: proposed.value });
  log.info('предложение сохранено', { user: job.userId });
  return { status: 'ok' };
};
