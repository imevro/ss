/**
 * Проверка схождения адресов и файлов: у каждой страницы вида `page.tsx` ровно одна
 * строка в таблице, а у каждой строки таблицы есть файл. Ловит страницу, положенную
 * на диск без строки, и строку, оставшуюся после удалённой страницы.
 *
 * Здесь же сверяется, что увод со страницы и собиратель адресов называют те же
 * отрезки, что и таблица: живым это ловит лишь заход браузером, а у страницы нет
 * ни браузерной среды, ни отрисовки.
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

/** Шаблоны адресов из таблицы: у `index` адрес — корень, у `route` — первый довод. */
const patternsOf = (text: string): readonly string[] => {
  const found = text.matchAll(/(?:^|\n)\s*(index|route)\('([^']*)'/g);
  return [...found].map((match) => {
    if (match[1] === 'index') return '/';
    return `/${match[2]}`;
  });
};

/** Куда кого уводят страницы: `redirect('/login')` — это адрес, который таблица обязана отдавать. */
const REDIRECT = /redirect\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

const redirectsOf = (text: string): readonly string[] => {
  const found = text.matchAll(REDIRECT);
  return [...found].map((match) => match[1]);
};

/** Собиратель адресов печатает компанию так: `/${slug}/<отрезки>`. Ловим их одним шаблоном. */
const COMPANY_ADDRESS = /`\/\$\{slug\}\/([^`]+)`/;

/** Отрезки адреса компании: `sessions` в `/${slug}/sessions/chat_1`. */
const companySegments = (text: string): readonly string[] => {
  const found = COMPANY_ADDRESS.exec(text);
  if (found === null) return [];
  return found[1].split('/');
};

const table = await Bun.file(new URL('./routes.ts', import.meta.url)).text();
const listed = listedOf(table);
const patterns = patternsOf(table);
const onDisk = [...new Bun.Glob('**/page.tsx').scanSync({ cwd: routesDir.pathname })].sort();
const pages = await Promise.all(onDisk.map((file) => Bun.file(new URL(file, routesDir)).text()));
const address = await Bun.file(new URL('./lib/address.ts', import.meta.url)).text();

describe('таблица адресов и файлы страниц', () => {
  test('у каждой страницы ровно одна строка в таблице', () => {
    const lonely = onDisk.filter((file) => listed.filter((name) => name === file).length !== 1);
    expect(lonely).toEqual([]);
  });

  test('у каждой строки таблицы есть файл', () => {
    const absent = listed.filter((name) => !onDisk.includes(name));
    expect(absent).toEqual([]);
  });

  test('каждый увод на экран входа ведёт в строку таблицы', () => {
    // Увод и строку связывает только текст адреса: страница с `redirect('/login')`
    // компилируется и проходит прочие проверки, даже если строку переименовали, —
    // живым это ловит лишь заход браузером. Здесь отрезок адреса сверяется с таблицей.
    const seen = pages.flatMap((page) => redirectsOf(page));
    // Совпадений нет — значит шаблон выше перестал узнавать уводы, и проверка пуста.
    expect(seen).toContain('/login');
    const homeless = seen.filter((target) => !patterns.includes(target));
    expect(homeless).toEqual([]);
  });

  test('отрезки адреса компании есть в таблице: собиратель адресов и таблица сходятся', () => {
    // Собиратель адресов печатает `/${slug}/sessions`, а страница этого адреса живёт
    // в таблице. Отрезки сверяем как текст: связь между ними больше нигде не видна.
    const segments = patterns.flatMap((pattern) => pattern.split('/'));
    const printed = companySegments(address);
    // Собиратель перестал печатать адрес компании — проверка ниже окажется пустой.
    expect(printed).toContain('sessions');
    const strangers = printed.filter((segment) => !segments.includes(segment));
    expect(strangers).toEqual([]);
  });
});
