/**
 * Имя компании для адреса страницы. Русские буквы в адресе недопустимы: переводим
 * в латиницу и оставляем строчные буквы, цифры и подчёркивания.
 */

const TRANSLIT: Readonly<Record<string, string>> = Object.fromEntries(
  'а=a|б=b|в=v|г=g|д=d|е=e|ё=e|ж=zh|з=z|и=i|й=y|к=k|л=l|м=m|н=n|о=o|п=p|р=r|с=s|т=t|у=u|ф=f|х=h|ц=c|ч=ch|ш=sh|щ=sch|ъ=|ы=y|ь=|э=e|ю=yu|я=ya'
    .split('|')
    .map((pair) => {
      const [from, to] = pair.split('=');
      // Запись без «=» — испорченный список переводов, а не пустая буква: молчать нельзя.
      if (from === undefined || to === undefined) throw new Error(`перевод букв испорчен: ${pair}`);
      return [from, to] as const;
    }),
);

/** Имя для адреса: строчные буквы, цифры, подчёркивания. */
export const toSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .split('')
    .map((symbol) => {
      const mapped = TRANSLIT[symbol];
      if (mapped === undefined) return symbol;
      return mapped;
    })
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (slug === '') throw new Error(`из имени «${name}» не выходит имя для адреса`);
  return slug;
};
