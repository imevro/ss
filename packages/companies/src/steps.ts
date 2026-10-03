import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';

/** Почта: одна собака, точка в домене. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Разделители в списке адресов: пробел, запятая, точка с запятой. */
const EMAIL_SPLIT = /[\s,;]+/;

/**
 * Онбординг детерминированный: четыре вопроса, никакой модели. Модель вызывается
 * один раз — на предложение таблиц, — и её ответ обязан лечь в схему предложения.
 */
export type OnboardingStepId = 'company' | 'business' | 'invites' | 'channels';

export type Channel = 'telegram' | 'slack' | 'whatsapp';

/** Список для выбора: он же источник подписей. Интерфейс своих названий не выдумывает. */
export const CHANNELS: readonly { readonly id: Channel; readonly name: string }[] = [
  { id: 'telegram', name: 'Телеграм' },
  { id: 'slack', name: 'Слэк' },
  { id: 'whatsapp', name: 'Ватсап' },
];

/**
 * Ответы по имени шага, а не списком по порядку: добавленный вопрос не сдвигает
 * соседние ответы. Пустое значение — ответа нет.
 */
export type OnboardingAnswers = {
  readonly company: string;
  readonly business: string;
  readonly invites: readonly string[];
  readonly channels: readonly Channel[];
  /** Пройденные шаги. Необязательный вопрос нельзя отличить «пропустил» от «не дошли»
   *  по значению ответа, поэтому пройденность хранится словом. */
  readonly done: readonly OnboardingStepId[];
};

export const EMPTY_ANSWERS: OnboardingAnswers = {
  company: '',
  business: '',
  invites: [],
  channels: [],
  done: [],
};

export type OnboardingStep = {
  readonly id: OnboardingStepId;
  readonly question: string;
  readonly kind: 'text' | 'longtext' | 'emails' | 'channels';
  readonly required: boolean;
  /** Подсказка в поле ответа. Шаг знает свой ответ — интерфейс ничего не выдумывает. */
  readonly hint: string;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'company',
    question: 'Как называется компания?',
    kind: 'text',
    required: true,
    hint: 'Название компании',
  },
  {
    id: 'business',
    question: 'Чем занимается компания?',
    kind: 'longtext',
    required: true,
    hint: 'Например: грузоперевозки через границу',
  },
  {
    id: 'invites',
    question: 'Кому прислать приглашения?',
    kind: 'emails',
    required: false,
    hint: 'Адреса почты через запятую',
  },
  {
    id: 'channels',
    question: 'Где идут рабочие коммуникации?',
    kind: 'channels',
    required: true,
    hint: 'Выберите мессенджеры',
  },
];

export type OnboardingError =
  | { readonly kind: 'empty'; readonly step: OnboardingStepId }
  | { readonly kind: 'bad_email'; readonly value: string }
  | { readonly kind: 'bad_channel'; readonly value: string }
  | { readonly kind: 'bad_name'; readonly value: string };

/** Имя начинается с буквы или цифры: точка в начале — опечатка, а не название. */
const STARTS_WITH_LETTER = /^[\p{L}\p{N}]/u;

/** Имена каналов для ответа: список плиток — единственный источник. */
const channelIds = (): readonly string[] => CHANNELS.map((channel) => channel.id);

/** Подпись канала: интерфейс берёт её тут, своих названий не выдумывает. */
export const channelName = (id: Channel): string => {
  const found = CHANNELS.find((channel) => channel.id === id);
  if (found === undefined) return id;
  return found.name;
};

/** Шаг принимается или отклоняется чистой функцией; сеть и база тут ни при чём. */
export const validateAnswer = (step: OnboardingStep, raw: string): Result<string, OnboardingError> => {
  const value = raw.trim();
  if (step.required && value === '') return err({ kind: 'empty', step: step.id });
  if (step.id === 'company' && value !== '' && !STARTS_WITH_LETTER.test(value)) {
    return err({ kind: 'bad_name', value });
  }
  if (step.kind === 'emails' && value !== '') {
    const bad = value
      .split(EMAIL_SPLIT)
      .filter((part) => part !== '')
      .find((part) => !EMAIL.test(part));
    if (bad !== undefined) return err({ kind: 'bad_email', value: bad });
  }
  if (step.kind === 'channels' && value !== '') {
    const known = channelIds();
    const bad = value
      .split(EMAIL_SPLIT)
      .filter((part) => part !== '')
      .find((part) => !known.includes(part));
    if (bad !== undefined) return err({ kind: 'bad_channel', value: bad });
  }
  return ok(value);
};

/** Значение из хранилища: не строка — значит ответа нет, а не выдуманное значение. */
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return '';
};

const listOf = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

/** Каналы из хранилища: чужие имена отбрасываем, своих не добавляем. */
const channelsOf = (value: unknown): readonly Channel[] =>
  CHANNELS.filter((channel) => listOf(value).includes(channel.id)).map((channel) => channel.id);

const stepIds = (value: unknown): readonly OnboardingStepId[] =>
  ONBOARDING_STEPS.filter((step) => listOf(value).includes(step.id)).map((step) => step.id);

/** Разбор хранимых ответов: старое или битое значение даёт пустые ответы, не ошибку. */
export const answersOf = (raw: unknown): OnboardingAnswers => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_ANSWERS;
  const record = raw as Record<string, unknown>;
  return {
    company: textOf(record.company),
    business: textOf(record.business),
    invites: listOf(record.invites),
    channels: channelsOf(record.channels),
    done: stepIds(record.done),
  };
};

/** Шаг отмечен пройденным: повторный ответ не повторяет его в списке. */
const passed = (answers: OnboardingAnswers, step: OnboardingStep): readonly OnboardingStepId[] => {
  if (answers.done.includes(step.id)) return answers.done;
  return [...answers.done, step.id];
};

/** Ответ записывается по имени шага: остальные ответы не двигаются. */
export const putAnswer = (
  answers: OnboardingAnswers,
  step: OnboardingStep,
  raw: string,
): Result<OnboardingAnswers, OnboardingError> => {
  const checked = validateAnswer(step, raw);
  if (!checked.ok) return err(checked.error);
  const value = checked.value;
  const done = passed(answers, step);
  if (step.kind === 'emails') {
    return ok({ ...answers, done, invites: value.split(EMAIL_SPLIT).filter((part) => part !== '') });
  }
  if (step.kind === 'channels') return ok({ ...answers, done, channels: channelsOf(value.split(EMAIL_SPLIT)) });
  if (step.id === 'company') return ok({ ...answers, done, company: value });
  return ok({ ...answers, done, business: value });
};

/** Ответ шага словами: лента показывает его, а не сырое значение хранилища. */
export const answerText = (answers: OnboardingAnswers, id: OnboardingStepId): string => {
  if (id === 'company') return answers.company;
  if (id === 'business') return answers.business;
  if (id === 'invites') return answers.invites.join(', ');
  return answers.channels.map(channelName).join(', ');
};

/** Следующий вопрос: первый непройденный шаг. Пройдены все — вопросов нет. */
export const nextStep = (answers: OnboardingAnswers): OnboardingStep | undefined =>
  ONBOARDING_STEPS.find((step) => !answers.done.includes(step.id));

/** Заголовок чата компании: имя человека, а не первый вопрос. */
export const companyTitle = (answers: OnboardingAnswers): string => {
  if (answers.company !== '') return answers.company;
  return 'Новая компания';
};
