import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';
import { z } from 'zod';

/** Предложение по таблицам компании. Ровно это модель обязана вернуть, ничего больше. */
export const companyProposalSchema = z.object({
  industry: z.string().describe('Отрасль одним-двумя словами'),
  entities: z
    .array(
      z.object({
        name: z.string().describe('Имя таблицы, строчными, во множественном числе, латиницей'),
        purpose: z.string().describe('Зачем эта таблица компании'),
        fields: z
          .array(
            z.object({
              name: z.string().describe('Имя столбца, строчными, латиницей'),
              type: z.enum(['text', 'number', 'money', 'date', 'bool', 'ref']).describe('Тип столбца'),
              note: z.string().describe('Что хранит столбец'),
            }),
          )
          .describe('Столбцы таблицы, от трёх до десяти'),
      }),
    )
    .describe('От четырёх до восьми таблиц, покрывающих работу компании'),
  departments: z.array(z.string()).describe('Отделы, которые угадываются по описанию'),
  use_cases: z.array(z.string()).describe('Что компания захочет делать с базой в первую очередь'),
});

export type CompanyProposal = z.infer<typeof companyProposalSchema>;

/** Проверка предложения перед показом владельцу: пустое предложение бесполезно. */
export const acceptProposal = (raw: unknown): Result<CompanyProposal, { readonly kind: 'invalid' }> => {
  const parsed = companyProposalSchema.safeParse(raw);
  if (!parsed.success) return err({ kind: 'invalid' });
  if (parsed.data.entities.length === 0) return err({ kind: 'invalid' });
  return ok(parsed.data);
};
