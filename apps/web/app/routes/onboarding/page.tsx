import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Textarea } from '@workspace/ui/components/textarea';
import { useState } from 'react';
import { redirect } from 'react-router';

import type { Route } from './+types/page';
import { companyAddress } from '@/lib/address';
import { api, apiOrigin, reasonOf, serverHeaders } from '@/lib/api';
import { noindexMeta } from '@/lib/page-title';

export const meta = () => noindexMeta(['Заводим компанию'], 'Три вопроса — и компания готова к работе.');

/** Имя шага: своё у каждого поля формы. */
type StepId = 'company' | 'business' | 'invites';

/** Шаг, каким его отдал сервер: страница показывает, полей не выдумывает. */
type Step = {
  readonly id: StepId;
  readonly question: string;
  readonly kind: string;
  readonly required: boolean;
  readonly hint: string;
};

type Answers = {
  readonly company: string;
  readonly business: string;
  readonly invites: readonly string[];
};

type Saved = { readonly answers: Answers };

type Company = { readonly id: string; readonly name: string; readonly slug: string };

/** Разделители адресов: те же, что понимает сервер. */
const ADDRESS_SPLIT = /[\s,;]+/;

/**
 * Онбординг — три вопроса и одна кнопка. Модель здесь не участвует: описание
 * остаётся в компании, адреса уходят в приглашения, база выписывается сразу.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const origin = apiOrigin(request);
  const headers = serverHeaders(request);
  // Кто вошёл, спрашиваем первым: отказ на входе — увод на экран входа, а не ошибка страницы.
  const me = await fetch(`${origin}/v1/me`, { headers });
  if (me.status === 401) throw redirect('/login');

  // Компания уже есть — онбординг этому человеку не нужен и не должен
  // открываться даже по прямой ссылке.
  const list = await api<{ companies: readonly Company[] }>(`${origin}/v1/companies`, { headers });
  if (list.companies.length > 0) throw redirect('/companies');

  const data = await api<{ steps: readonly Step[] }>(`${origin}/v1/onboarding/steps`, { headers });
  const saved = await api<{ onboarding: Saved }>(`${origin}/v1/onboarding`, { headers });
  return { steps: data.steps, saved: saved.onboarding };
}

/** Поле шага: длинный ответ — многострочный, остальные — одна строка. */
function Field({
  step,
  value,
  onChange,
}: {
  readonly step: Step;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  if (step.kind === 'longtext') {
    return (
      <Textarea id={step.id} value={value} placeholder={step.hint} onChange={(event) => onChange(event.target.value)} />
    );
  }
  return (
    <Input id={step.id} value={value} placeholder={step.hint} onChange={(event) => onChange(event.target.value)} />
  );
}

export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const { steps, saved } = loaderData;
  const [answers, setAnswers] = useState<Readonly<Record<StepId, string>>>({
    company: saved.answers.company,
    business: saved.answers.business,
    invites: saved.answers.invites.join(', '),
  });
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = answers.company.trim() !== '' && answers.business.trim() !== '';

  /** Ответы сохраняются, компания заводится, база выписывается — одним нажатием. */
  const create = async (): Promise<void> => {
    setBusy(true);
    setProblem('');
    try {
      for (const step of steps) {
        await api('/v1/onboarding/answers', {
          method: 'PUT',
          body: JSON.stringify({ step: step.id, value: answers[step.id] }),
        });
      }
      const created = await api<{ company: Company }>('/v1/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: answers.company.trim(),
          business: answers.business.trim(),
          invites: answers.invites.split(ADDRESS_SPLIT).filter((part) => part !== ''),
        }),
      });
      await api(`/v1/companies/${created.company.id}/database`, { method: 'POST' });
      globalThis.location.assign(companyAddress(created.company.slug));
    } catch (error) {
      setProblem(reasonOf(error));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-8 p-6">
      <h1 className="font-heading font-medium text-2xl">Заводим компанию</h1>

      <div className="flex flex-col gap-5">
        {steps.map((step) => (
          <div key={step.id} className="flex flex-col gap-2">
            <Label htmlFor={step.id}>{step.question}</Label>
            <Field
              step={step}
              value={answers[step.id]}
              onChange={(value) => setAnswers((current) => ({ ...current, [step.id]: value }))}
            />
          </div>
        ))}
        {problem !== '' && <p className="text-destructive">{problem}</p>}
        <Button disabled={busy || !ready} onClick={() => void create()}>
          {busy ? 'Завожу…' : 'Завести компанию'}
        </Button>
      </div>
    </main>
  );
}
