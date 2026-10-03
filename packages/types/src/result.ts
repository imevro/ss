/**
 * Result — ошибки как значения. Ядро не бросает исключений: каждый отказ это
 * данные, которые оболочка превращает в код ответа.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const mapResult = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> => {
  if (!r.ok) return r;
  return ok(f(r.value));
};

export const isOk = <T, E>(r: Result<T, E>): r is { readonly ok: true; readonly value: T } => r.ok;
