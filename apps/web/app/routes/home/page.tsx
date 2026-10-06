import { Badge } from '@workspace/ui/components/badge';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@workspace/ui/components/item';
import { redirect } from 'react-router';

import type { Route } from './+types/page';
import { api } from '@/lib/api';
import { noindexMeta } from '@/lib/page-title';

export const meta = () => noindexMeta(['Компании'], 'Компании, к которым у вас есть доступ.');

type Company = { readonly id: string; readonly name: string; readonly database: string };

/**
 * Загрузчик спрашивает, кто вошёл, и уводит на нужный экран. Делается на сервере:
 * до отрисовки известно, показывать компании или онбординг.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get('cookie');
  const headers = new Headers();
  if (cookie !== null) headers.set('cookie', cookie);
  const me = await fetch(`${origin}/v1/me`, { headers });
  if (me.status === 401) throw redirect('/login');

  const list = await api<{ companies: readonly Company[] }>(`${origin}/v1/companies`, { headers });
  if (list.companies.length === 0) throw redirect('/onboarding');
  return { companies: list.companies };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 py-16">
      <h1 className="px-4 font-heading font-medium text-2xl">Компании</h1>
      <ItemGroup>
        {loaderData.companies.map((company) => (
          <Item key={company.id} render={<a href={`/c/${company.id}`}>{company.name}</a>}>
            <ItemContent>
              <ItemTitle>{company.name}</ItemTitle>
              <ItemDescription>База компании</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="outline">{company.database}</Badge>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </main>
  );
}
