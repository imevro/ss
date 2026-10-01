/**
 * SGR — Schema-Guided Reasoning. Модель заполняет схему, код решает, годна ли она.
 * Вердикт «принять или отклонить» модель не выносит никогда.
 */
import { generateObject } from 'xsai'
import type { z } from 'zod'
import type { Result } from '@workspace/core'
import { err, ok } from '@workspace/core'

export type SgrError =
  | { readonly kind: 'model'; readonly message: string }
  | { readonly kind: 'attempts'; readonly tried: number }

export type SgrInput<T> = {
  readonly schema: z.ZodType<T>
  readonly system: string
  readonly user: string
  readonly baseURL: string
  readonly model: string
  readonly apiKey?: string
  /** Сколько раз переспрашивать, если ответ не лёг в схему. По умолчанию два. */
  readonly attempts?: number
}

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Один вызов модели с повтором. Ретрай — рекурсия, а не счётчик с присваиванием:
 * состояние цикла тут не нужно.
 */
export const sgr = async <T>(input: SgrInput<T>): Promise<Result<T, SgrError>> => {
  const attempts = input.attempts ?? 2

  const attempt = async (left: number): Promise<Result<T, SgrError>> => {
    const messages = [
      { role: 'system' as const, content: input.system },
      { role: 'user' as const, content: input.user },
    ]
    try {
      const result = await generateObject({
        baseURL: input.baseURL,
        apiKey: input.apiKey,
        model: input.model,
        messages,
        // xsai принимает схему из xsschema; zod-схема совместима, тип приводим на границе.
        schema: input.schema as never,
      })
      const parsed = input.schema.safeParse(result.object)
      if (parsed.success) return ok(parsed.data)
      if (left <= 1) return err({ kind: 'model', message: `схема не приняла ответ: ${parsed.error.message}` })
      return attempt(left - 1)
    } catch (error) {
      if (left <= 1) return err({ kind: 'model', message: messageOf(error) })
      return attempt(left - 1)
    }
  }

  return attempt(attempts)
}
