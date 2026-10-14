/**
 * Сбор предложения таблиц: модель зовут из очереди, а не из запроса человека.
 * Готовое предложение ложится в онбординг — страница найдёт его при обновлении.
 *
 * Задача несёт только номер человека: описание берётся из сохранённых ответов на
 * момент работы. Иначе повтор после правки ответа принёс бы предложение по старому
 * тексту, а две задачи одного человека считались бы разными.
 */
import { companyProposal, savedOnboarding, saveProposal } from '@workspace/companies';
import { createLogger, logStep } from '@workspace/log';
import type { Jobs } from '@workspace/types';
import { onboardingRoom } from '@workspace/types';

import { config } from './env';
import { tell } from './tell';

const log = createLogger('onboarding.proposal');

export type ProposalJob = Jobs['onboarding:proposal'];

/** Комната человека, который ждёт предложение. */
const roomOf = (userId: string): string => onboardingRoom(userId);

/** Собрать предложение и сохранить. Провал не роняет воркер: он пишет в журнал. */
export const proposeFor = async (job: ProposalJob): Promise<{ readonly status: 'ok' | 'failed' }> => {
  const saved = await savedOnboarding(job.userId);
  if (saved.answers.business === '') {
    log.warn('предложение не собрано: нет описания компании', { user: job.userId });
    return { status: 'failed' };
  }

  // Строка открывается до обращения к модели: расход ложится в неё же.
  const step = await logStep.start({
    ctx: { runId: `onboarding:proposal:${job.userId}`, agent: 'onboarding:proposal', model: config.llmModel },
    toolName: 'model:company-proposal',
    explanation: 'собираю предложение таблиц',
    input: { business: saved.answers.business },
  });

  const proposed = await companyProposal(saved.answers.business, {
    baseURL: config.llmBaseUrl,
    apiKey: config.llmApiKey,
    model: config.llmModel,
  });
  if (!proposed.ok) {
    await step.finish({ output: proposed.error, kind: 'error' });
    log.error('предложение не собрано', { user: job.userId, error: proposed.error });
    await tell(roomOf(job.userId), { kind: 'problem', reason: 'модель не ответила' });
    return { status: 'failed' };
  }

  const proposal = proposed.value.answer;
  await step.finish({ output: proposal, tokens: proposed.value.usage });
  await saveProposal(job.userId, proposal);
  // Страница не спрашивает «готово ли»: предложение само приходит в её комнату.
  await tell(roomOf(job.userId), { kind: 'proposal', proposal });
  log.info('предложение сохранено', { user: job.userId });
  return { status: 'ok' };
};
