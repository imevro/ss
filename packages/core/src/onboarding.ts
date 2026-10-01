import { z } from 'zod'
import type { Result } from './result'
import { err, ok } from './result'

/**
 * Онбординг детерминированный: четыре вопроса, никакой модели. Модель вызывается
 * один раз — на предложение таблиц, — и её ответ обязан лечь в схему ниже.
 */
export type OnboardingStepId = 'company' | 'business' | 'invites' | 'channels'

export type OnboardingAnswers = {
  readonly companyName: string
  readonly business: string
  readonly invites: readonly string[]
  readonly channels: readonly Channel[]
}

export type Channel = 'telegram' | 'slack'

export type OnboardingStep = {
  readonly id: OnboardingStepId
  readonly question: string
  readonly kind: 'text' | 'longtext' | 'emails' | 'channels'
  readonly required: boolean
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'company', question: 'Как называется компания?', kind: 'text', required: true },
  { id: 'business', question: 'Чем занимается компания?', kind: 'longtext', required: true },
  { id: 'invites', question: 'Кому прислать приглашения?', kind: 'emails', required: false },
  { id: 'channels', question: 'Где идут рабочие коммуникации?', kind: 'channels', required: true },
]

export type OnboardingError =
  | { readonly kind: 'empty'; readonly step: OnboardingStepId }
  | { readonly kind: 'bad_email'; readonly value: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Шаг принимается или отклоняется чистой функцией; сеть и база тут ни при чём. */
export const validateAnswer = (step: OnboardingStep, raw: string): Result<string, OnboardingError> => {
  const value = raw.trim()
  if (step.required && value === '') return err({ kind: 'empty', step: step.id })
  if (step.kind === 'emails' && value !== '') {
    const bad = value
      .split(/[\s,;]+/)
      .filter((part) => part !== '')
      .find((part) => !EMAIL.test(part))
    if (bad !== undefined) return err({ kind: 'bad_email', value: bad })
  }
  return ok(value)
}

/** Предложение по таблицам. Ровно это модель обязана вернуть, ничего больше. */
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
})

export type CompanyProposal = z.infer<typeof companyProposalSchema>

/** Проверка предложения перед показом владельцу: пустое предложение бесполезно. */
export const acceptProposal = (raw: unknown): Result<CompanyProposal, { readonly kind: 'invalid' }> => {
  const parsed = companyProposalSchema.safeParse(raw)
  if (!parsed.success) return err({ kind: 'invalid' })
  if (parsed.data.entities.length === 0) return err({ kind: 'invalid' })
  return ok(parsed.data)
}

/** Имя схемы таблицы: латиница, строчные, подчёркивания. Нужно и для SQL, и для имён ролей. */
export const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
