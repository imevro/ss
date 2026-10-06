/**
 * Проверка схождения адресов и файлов: у каждой страницы вида `page.tsx` ровно одна
 * строка в таблице, а у каждой строки таблицы есть файл. Ловит страницу, положенную
 * на диск без строки, и строку, оставшуюся после удалённой страницы.
 *
 * Запуск: bun test app/routes.test.ts
 */
import { describe, expect, test } from 'bun:test';

const routesDir = new URL('./routes/', import.meta.url);

/** Страницы, которые зовёт таблица: имена файлов без начала пути. */
const listedOf = (text: string): readonly string[] => {
  const found = text.matchAll(/'routes\/([^']+\.tsx)'/g);
  return [...found].map((match) => match[1]);
};

const listed = listedOf(await Bun.file(new URL('./routes.ts', import.meta.url)).text());
const onDisk = [...new Bun.Glob('**/page.tsx').scanSync({ cwd: routesDir.pathname })].sort();

describe('таблица адресов и файлы страниц', () => {
  test('у каждой страницы ровно одна строка в таблице', () => {
    const lonely = onDisk.filter((file) => listed.filter((name) => name === file).length !== 1);
    expect(lonely).toEqual([]);
  });

  test('у каждой строки таблицы есть файл', () => {
    const absent = listed.filter((name) => !onDisk.includes(name));
    expect(absent).toEqual([]);
  });
});
