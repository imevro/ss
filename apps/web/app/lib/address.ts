/**
 * Адреса панели. Приставка базы («chat_», «app_») в адресе не живёт: в базе номера
 * с приставкой, в адресе — без. Собирать адрес руками в разметке нельзя: иначе
 * однажды появится третий вид адреса.
 */

/** Номер записи в адресе: всё до первого подчёркивания — приставка базы. */
export const shortId = (id: string): string => {
  const cut = id.indexOf('_');
  if (cut < 0) return id;
  return id.slice(cut + 1);
};

/** Компания: слаг, как он назван в базе. */
export const companyAddress = (slug: string): string => `/${slug}/sessions`;

/** Один разговор или миниапп: открыто то, чей номер стоит в адресе. */
export const sessionAddress = (slug: string, id: string): string => `${companyAddress(slug)}/${shortId(id)}`;
