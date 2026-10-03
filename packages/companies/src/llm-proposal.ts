/**
 * Предложение таблиц от модели. Здесь только сборка запроса к модели: годность
 * ответа проверяет схема, решение принимает код.
 */
import type { Result } from '@workspace/types';

import type { CompanyProposal } from './proposal';
import { companyProposalSchema } from './proposal';
import type { SgrError } from './sgr';
import { sgr } from './sgr';

export type ProposalConfig = {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly model: string;
};

const SYSTEM = [
  'Ты помогаешь завести базу данных небольшой компании.',
  'Отвечай по-русски, коротко, без пояснений вне схемы.',
  'Таблицы называй строчными буквами латиницей во множественном числе.',
  'Число таблиц — от четырёх до шести. У каждой таблицы от трёх до шести столбцов.',
  'Поле note — не длиннее восьми слов.',
  'Типы столбцов выбирай из: text, number, money, date, bool, ref.',
].join('\n');

export const companyProposal = (business: string, config: ProposalConfig): Promise<Result<CompanyProposal, SgrError>> =>
  sgr({
    schema: companyProposalSchema,
    system: SYSTEM,
    user: `Чем занимается компания: ${business}`,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    // Схема объёмная: без запаса ответ обрывается на середине строки.
    maxTokens: 8192,
    deadlineSeconds: 150,
  });
