/**
 * SGR — Schema-Guided Reasoning. Модель заполняет схему, код решает, годна ли она.
 * Вердикт «принять или отклонить» модель не выносит никогда.
 *
 * Границы обязательны: без потолка генерации модель может лить текст часами и
 * занять воркер целиком.
 */

import type { Result } from '@workspace/types';
import { err, ok } from '@workspace/types';
import { generateObject } from 'xsai';
import type { z } from 'zod';

export type SgrError =
  | { readonly kind: 'model'; readonly message: string }
  | { readonly kind: 'timeout'; readonly seconds: number };

export type SgrInput<T> = {
  readonly schema: z.ZodType<T>;
  readonly system: string;
  readonly user: string;
  readonly baseURL: string;
  readonly model: string;
  readonly apiKey?: string;
  /** Сколько раз переспрашивать, если ответ не лёг в схему. По умолчанию два. */
  readonly attempts?: number;
  /** Потолок генерации. По умолчанию 4096 — ответ короткий: схема, а не текст. */
  readonly maxTokens?: number;
  /** Общий срок одного вызова. По умолчанию 120 секунд. */
  readonly deadlineSeconds?: number;
  /** Сколько модели думать. По умолчанию «низко»: ждать ответа человеку, а не машине. */
  readonly effort?: ReasoningEffort;
};

/**
 * Поля запроса, которых нет в объявлении xsai. Тело он отправляет как есть,
 * поэтому недостающие поля добавляем на границе: потолок генерации и усилие.
 */
type ExtraFields = { readonly maxTokens: number; readonly reasoningEffort: ReasoningEffort };

/**
 * Усилие рассуждения. Набор наш: так его принимает наш шлюз моделей.
 * У xsai это же поле объявлено своим списком, который уже — на границе расширяем.
 */
export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const withDefault = <T>(value: T | undefined, fallback: T): T => {
  if (value === undefined) return fallback;
  return value;
};

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

/** Провал по сроку приходит от xsai текстом: различаем его, чтобы дать свой вид ошибки. */
const isTimeout = (message: string): boolean => message.includes('abort') || message.includes('timeout');

/**
 * Один вызов модели с повтором. Ретрай — рекурсия, а не счётчик с присваиванием:
 * состояние цикла тут не нужно.
 */
export const sgr = <T>(input: SgrInput<T>): Promise<Result<T, SgrError>> => {
  const attempts = withDefault(input.attempts, 2);
  const maxTokens = withDefault(input.maxTokens, 4096);
  const deadlineMs = withDefault(input.deadlineSeconds, 120) * 1000;

  const attempt = async (left: number): Promise<Result<T, SgrError>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    const messages = [
      { role: 'system' as const, content: input.system },
      { role: 'user' as const, content: input.user },
    ];
    try {
      // Потолок генерации xsai переводит в max_tokens: в объявлении типа поля нет,
      // поэтому передаём его расширением объекта, а не выключением проверки.
      const extra: ExtraFields = { maxTokens, reasoningEffort: withDefault(input.effort, 'low') };
      const result = await generateObject({
        baseURL: input.baseURL,
        apiKey: input.apiKey,
        model: input.model,
        messages,
        abortSignal: controller.signal,
        ...(extra as unknown as object),
        // xsai принимает схему из xsschema; zod-схема совместима, тип приводим на границе.
        schema: input.schema as never,
      });
      const parsed = input.schema.safeParse(result.object);
      if (parsed.success) return ok(parsed.data);
      if (left <= 1) return err({ kind: 'model', message: `схема не приняла ответ: ${parsed.error.message}` });
      return attempt(left - 1);
    } catch (error) {
      const message = messageOf(error);
      if (left <= 1) {
        if (isTimeout(message)) return err({ kind: 'timeout', seconds: deadlineMs / 1000 });
        return err({ kind: 'model', message });
      }
      return attempt(left - 1);
    } finally {
      clearTimeout(timer);
    }
  };

  return attempt(attempts);
};
