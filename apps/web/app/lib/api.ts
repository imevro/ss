/** Заголовки для запроса с сервера: кука входа переносится как есть. */
export const serverHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie !== null) headers.set('cookie', cookie);
  return headers;
};

/** Обращение к своему API. Ошибку отдаём наверх, а не прячем. */
export const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`отказ ${response.status}`);
  return (await response.json()) as T;
};

/** Ответ входа от better-auth: успех или текст отказа. */
export const errorText = (error: { message?: string } | null | undefined): string | undefined => {
  if (error === null || error === undefined) return;
  if (error.message === undefined) return 'не вышло';
  return error.message;
};

/** Что сказать человеку, когда запрос не прошёл. */
export const reasonOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'не вышло';
};
