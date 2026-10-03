/**
 * Ошибки в одном виде на весь API: RFC 9457, `application/problem+json`.
 * Клиент ветвится по `code`, а не по тексту: текст можно переписать, код — нет.
 */

import { newId } from '@workspace/db';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Виды отказов. Один список: клиент и документация берут коды отсюда. */
export type ProblemCode = 'unauthorized' | 'forbidden' | 'not_found' | 'bad_request' | 'conflict' | 'unavailable';

const TITLES: Readonly<Record<ProblemCode, string>> = {
  unauthorized: 'Требуется вход',
  forbidden: 'Нет доступа',
  not_found: 'Не найдено',
  bad_request: 'Запрос не понят',
  conflict: 'Сейчас нельзя',
  unavailable: 'Не готово',
};

/**
 * Отказ. `detail` — что именно пошло не так; `code` — машинное слово для ветвления.
 * Номер запроса даёт возможность найти его в журнале.
 */
export const problem = (c: Context, status: ContentfulStatusCode, code: ProblemCode, detail: string): Response => {
  const requestId = newId('request');
  return c.json(
    {
      type: `https://ss.erodionov.com/problems/${code}`,
      title: TITLES[code],
      status,
      code,
      detail,
      request_id: requestId,
    },
    status,
    { 'content-type': 'application/problem+json' },
  );
};
