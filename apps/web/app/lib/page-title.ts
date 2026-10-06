/**
 * Заголовки и описания страниц. Один сборщик на все маршруты: части от частной к
 * общей, имя продукта в конце. Экраны здесь внутренние, поэтому поисковикам вход
 * закрыт — вид у всех один.
 */

/** Как называется продукт: в конце заголовка и в описании. */
const PRODUCT = 's.solutions';

/** Части заголовка — только свои строки: пустые и пробельные выкидываются. */
const partsOf = (segments: readonly (string | null | undefined)[]): readonly string[] =>
  segments
    .filter((segment): segment is string => typeof segment === 'string')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');

/** Заголовок страницы: части от частной к общей, имя продукта в конце. */
export const pageTitle = (segments: readonly (string | null | undefined)[]): string =>
  [...partsOf(segments), PRODUCT].join(' — ');

/** Описание страницы: сказанное маршрутом плюс имя продукта. */
export const pageDescription = (description: string): string => `${description} ${PRODUCT}`;

/** Внутренние экраны в поиск не пускаем: заголовок, описание и запрет одним набором. */
export const noindexMeta = (segments: readonly (string | null | undefined)[], description: string) => [
  { title: pageTitle(segments) },
  { name: 'description', content: pageDescription(description) },
  { name: 'robots', content: 'noindex, nofollow' },
];
