/** Заголовки для запроса с сервера: кука входа переносится как есть. */
export const serverHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie !== null) headers.set('cookie', cookie);
  return headers;
};

/**
 * Адрес API для загрузчиков. За обратным прокси схема страницы — http (прокси
 * снимает шифр), и адрес страницы уводит запрос на 308 к https, а при переходе
 * браузерный клиент теряет куку. Потому адрес берём из настройки; не задана —
 * адрес страницы, как в разработке.
 */
export const apiOrigin = (request: Request): string => {
  const configured = process.env.API_ORIGIN;
  if (configured !== undefined && configured !== '') return configured;
  return new URL(request.url).origin;
};

/** Обращение к своему API. Ошибку отдаём наверх, а не прячем. */
export const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`отказ ${response.status}`);
  return (await response.json()) as T;
};

/** Текст отказа входа. Отказа нет — звать незачем; поле без причины даёт общее слово. */
export const errorText = (error: { message?: string }): string => {
  if (error.message === undefined) return 'не вышло';
  return error.message;
};

/** Что сказать человеку, когда запрос не прошёл. */
export const reasonOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'не вышло';
};
