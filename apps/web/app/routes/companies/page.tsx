import { Item, ItemContent, ItemGroup, ItemTitle } from '@workspace/ui/components/item';
import { redirect } from 'react-router';

import type { Route } from './+types/page';
import { companyAddress } from '@/lib/address';
import { api, apiOrigin, serverHeaders } from '@/lib/api';
import { noindexMeta } from '@/lib/page-title';

export const meta = () => noindexMeta(['Компании'], 'Компании, к которым у вас есть доступ.');

type Company = { readonly id: string; readonly slug: string; readonly name: string };

/**
 * Список компаний — своя дверь в панель. Он открывается всегда, даже когда
 * компаний нет: отсюда видно, что доступ пуст, и можно уйти в онбординг.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const origin = apiOrigin(request);
  const headers = serverHeaders(request);
  const me = await fetch(`${origin}/v1/me`, { headers });
  if (me.status === 401) throw redirect('/login');

  const list = await api<{ companies: readonly Company[] }>(`${origin}/v1/companies`, { headers });
  return { companies: list.companies };
}

export default function Companies({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 py-16">
      <div className="flex items-center justify-between gap-4 px-4">
        <h1 className="font-heading font-medium text-2xl">Компании</h1>
        {/* Компаний может быть сколько угодно: завод новой не закрыт после первой. */}
        <a className="underline" href="/onboarding">
          Завести компанию
        </a>
      </div>
      {loaderData.companies.length === 0 ? (
        <p className="px-4 text-muted-foreground">Доступных компаний нет.</p>
      ) : (
        <ItemGroup>
          {loaderData.companies.map((company) => (
            <Item key={company.id} render={<a href={companyAddress(company.slug)}>{company.name}</a>}>
              <ItemContent>
                <ItemTitle>{company.name}</ItemTitle>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </main>
  );
}
