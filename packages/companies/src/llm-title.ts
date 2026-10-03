/**
 * Название чата от модели. Здесь только сборка запроса: годность ответа проверяет
 * схема. Название — украшение списка, поэтому неудача не мешает ответу: чат
 * остаётся с прежним именем.
 */
import type { Result } from '@workspace/types';
import { z } from 'zod';

import type { SgrError } from './sgr';
import { sgr } from './sgr';

/** Сколько знаков вопроса отдаём модели. Первый вопрос бывает длинным, а имя — нет. */
const INPUT_LIMIT = 2000;

/** Ровно это модель обязана вернуть, ничего больше. */
export const chatTitleSchema = z.object({
  title: z.string().min(1).max(60).describe('Название чата: до трёх слов, по делу'),
});

export type ChatTitle = z.infer<typeof chatTitleSchema>;

export type TitleConfig = {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly model: string;
};

const SYSTEM = [
  'Ты придумываешь короткое название чата с ассистентом по первому вопросу человека.',
  'Правила: не больше трёх слов, тот же язык, что у вопроса, без кавычек, без точки в конце.',
  'Отбрасывай лишнее: оставляй предмет, а не действие.',
  'Примеры:',
  '  «Проанализируй этот рилс, чтобы переснять» — «Анализ рилса»',
  '  «Сделай транскрипт рилса через gemini» — «Транскрипт рилса»',
  '  «Собери таблицу расходов за месяц» — «Таблица расходов»',
  'Ответь названием в одну строку и больше ничем.',
].join('\n');

/** Название по первому вопросу. Срок короткий: человек ждёт ответа, а не списка. */
export const chatTitle = (firstMessage: string, config: TitleConfig): Promise<Result<ChatTitle, SgrError>> =>
  sgr({
    schema: chatTitleSchema,
    system: SYSTEM,
    user: `Первый вопрос: ${firstMessage.slice(0, INPUT_LIMIT)}`,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    deadlineSeconds: 30,
  });
