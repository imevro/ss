/** Один сборщик заголовков на все маршруты: части от частной к общей, имя продукта в конце. */
export const pageTitle = (segments: readonly (string | null | undefined)[]): string => {
  const parts = segments
    .filter((segment): segment is string => typeof segment === 'string')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
  return [...parts, 's.solutions'].join(' — ');
};

/** Внутренние экраны в поиск не пускаем: заголовок тот же, плюс запрет. */
export const noindexMeta = (segments: readonly (string | null | undefined)[]) => [
  { title: pageTitle(segments) },
  { name: 'robots', content: 'noindex' },
];
