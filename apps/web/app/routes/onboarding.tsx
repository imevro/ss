import { SlackIcon, TelegramIcon, WhatsappIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ClientEvent } from '@workspace/types';
import { onboardingRoom } from '@workspace/types';
import type { AgentActivityItem } from '@workspace/ui/components/agents/agent-activity';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import {
  Question,
  QuestionOption,
  QuestionOptions,
  Questions,
  QuestionsFooter,
  QuestionsHeader,
  QuestionsSubmit,
  QuestionsTitle,
} from '@workspace/ui/components/nexus-ui/questions';
import { Separator } from '@workspace/ui/components/separator';
import { useCallback, useState } from 'react';
import { redirect } from 'react-router';

import type { Route } from './+types/onboarding';
import type { Turn } from '@/components/chat';
import { ChatComposer, ChatThread } from '@/components/chat';
import { api, reasonOf, serverHeaders } from '@/lib/api';
import { useLiveRoom } from '@/lib/live';
import { noindexMeta } from '@/lib/page-title';

export const meta = () => noindexMeta(['Заводим компанию']);

/** Шаг, каким его отдал сервер: страница показывает, вопросов не выдумывает. */
type Step = {
  readonly id: string;
  readonly question: string;
  readonly kind: string;
  readonly required: boolean;
  readonly hint: string;
};

/** Ответы по имени шага и пройденные шаги: их отдаёт сервер. */
type Answers = {
  readonly company: string;
  readonly business: string;
  readonly invites: readonly string[];
  readonly channels: readonly string[];
  readonly done: readonly string[];
};

type Field = { readonly name: string; readonly type: string; readonly note: string };
type Entity = { readonly name: string; readonly purpose: string; readonly fields: readonly Field[] };
type Proposal = {
  readonly industry: string;
  readonly entities: readonly Entity[];
  readonly departments: readonly string[];
  readonly use_cases: readonly string[];
};
type Company = { readonly id: string; readonly name: string; readonly slug: string };
type Channel = { readonly id: string; readonly name: string };

/** Что человек уже прошёл: ответы и предложение живут в базе, а не в памяти страницы. */
type Saved = {
  readonly answers: Answers;
  readonly proposal: Proposal | null;
};

/** Значок мессенджера берём из набора значков: своих картинок не рисуем. */
const CHANNEL_ICONS: Readonly<Record<string, typeof TelegramIcon>> = {
  telegram: TelegramIcon,
  slack: SlackIcon,
  whatsapp: WhatsappIcon,
};

/**
 * Работа ассистента при подборе таблиц: один запрос к модели — одна строка.
 * Выдуманные промежуточные шаги показывали бы то, чего не происходит.
 */
const workItems = (): readonly AgentActivityItem[] => [
  { id: 'proposal', type: 'step', label: 'Подбираю таблицы по описанию', status: 'active' },
];

/**
 * Шаги, мессенджеры и пройденное приходят с сервера: первый же ответ содержит
 * вопрос и прежние ответы, поэтому картинка не мигает пустым окном.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  const headers = serverHeaders(request);
  const me = await fetch(`${origin}/v1/me`, { headers });
  if (me.status === 401) throw redirect('/login');
  const who = (await me.json()) as { user: { id: string } };
  const data = await api<{ steps: readonly Step[]; channels: readonly Channel[] }>(`${origin}/v1/onboarding/steps`, {
    headers,
  });
  const saved = await api<{ onboarding: Saved }>(`${origin}/v1/onboarding`, { headers });
  return { userId: who.user.id, steps: data.steps, channels: data.channels, saved: saved.onboarding };
}

/** Подпись канала: список пришёл с сервера, своих названий страница не выдумывает. */
const channelLabel = (channels: readonly Channel[], id: string): string => {
  const found = channels.find((channel) => channel.id === id);
  if (found === undefined) return '';
  return found.name;
};

/** Значок для плитки мессенджера. */
const ChannelIcon = ({ id }: { readonly id: string }) => {
  const icon = CHANNEL_ICONS[id];
  if (icon === undefined) return null;
  return <HugeiconsIcon icon={icon} className="size-4" />;
};

/** Ответ шага словами: канал показываем его именем, а не машинным словом. */
const answerText = (answers: Answers, step: Step, channels: readonly Channel[]): string => {
  if (step.id === 'company') return answers.company;
  if (step.id === 'business') return answers.business;
  if (step.id === 'invites') return answers.invites.join(', ');
  return answers.channels
    .map((id) => channelLabel(channels, id))
    .filter((name) => name !== '')
    .join(', ');
};

/**
 * Онбординг — чат с ассистентом: вопросы приходят сообщениями, человек отвечает.
 * Предложение таблиц собирается в очереди и приходит в комнату страницы.
 */
export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const { steps, channels, saved, userId } = loaderData;
  const [answers, setAnswers] = useState<Answers>(saved.answers);
  const [proposal, setProposal] = useState<Proposal | null>(saved.proposal);
  const [company, setCompany] = useState<Company | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);

  const asked = steps.find((step) => !answers.done.includes(step.id));
  const collecting = asked === undefined && proposal === null && company === null;

  /** Событие комнаты: предложение приходит само, опроса страницы больше нет. */
  const onEvent = useCallback((event: ClientEvent) => {
    if (event.kind === 'proposal') {
      setProposal(event.proposal as Proposal);
      setWaiting(false);
      return;
    }
    if (event.kind === 'problem') {
      setProblem(event.reason);
      setWaiting(false);
    }
  }, []);
  useLiveRoom(onboardingRoom(userId), onEvent);

  /**
   * Лента идёт разговором: вопрос, ответ, следующий вопрос. Вопросы впереди
   * заданного ещё не заданы — все сразу они превращают разговор в анкету.
   */
  const turns: readonly Turn[] = [
    ...steps.flatMap((step) => {
      if (!answers.done.includes(step.id) && step.id !== asked?.id) return [];
      const question: Turn = {
        id: `${step.id}-q`,
        from: 'assistant',
        text: step.question,
        at: null,
        typing: step.id === asked?.id,
      };
      if (!answers.done.includes(step.id)) return [question];
      const given: Turn = {
        id: `${step.id}-a`,
        from: 'user',
        text: answerText(answers, step, channels),
        at: null,
        typing: false,
      };
      return [question, given];
    }),
    ...workTurn(waiting),
  ];

  /** Ответ записывается сразу, вместе с пройденным шагом: обновление их не теряет. */
  const save = async (step: Step, value: string): Promise<void> => {
    setProblem('');
    try {
      const data = await api<{ onboarding: Saved }>('/v1/onboarding/answers', {
        method: 'PUT',
        body: JSON.stringify({ step: step.id, value }),
      });
      setAnswers(data.onboarding.answers);
    } catch (error) {
      setProblem(reasonOf(error));
    }
  };

  /** Последний ответ отправляет сбор в очередь; дальше ждём событие комнаты. */
  const send = async (text: string): Promise<void> => {
    if (asked === undefined) return;
    await save(asked, text);
    const left = steps.filter((step) => !answers.done.includes(step.id) && step.id !== asked.id);
    if (left.length > 0) return;
    await collect();
  };

  /** Сбор предложения: постановка задачи. Ответ придёт в комнату сам. */
  const collect = async (): Promise<void> => {
    setWaiting(true);
    setProblem('');
    try {
      await api('/v1/onboarding/proposal', { method: 'POST', body: JSON.stringify({}) });
    } catch (error) {
      setProblem(reasonOf(error));
      setWaiting(false);
    }
  };

  /** Подтверждение: компания заводится, база выписывается очередью. */
  const confirm = async (): Promise<void> => {
    if (proposal === null) return;
    setBusy(true);
    setProblem('');
    try {
      const created = await api<{ company: Company }>('/v1/companies', {
        method: 'POST',
        body: JSON.stringify({ name: answers.company, proposal, invites: answers.invites }),
      });
      setCompany(created.company);
      await api(`/v1/companies/${created.company.id}/database`, { method: 'POST' });
      const invitation = await api<{ link: string | null }>(`/v1/companies/${created.company.id}/invitation`);
      setInvitationLink(invitation.link);
    } catch (error) {
      setProblem(reasonOf(error));
    }
    setBusy(false);
  };

  return (
    <main className="mx-auto flex h-svh w-full max-w-2xl flex-col">
      <h1 className="shrink-0 px-6 pt-8 pb-4 font-heading font-medium text-2xl">Заводим компанию</h1>

      <ChatThread turns={turns} />

      {problem !== '' && <p className="shrink-0 px-6 py-2 text-destructive">{problem}</p>}

      {collecting && !waiting && (
        <div className="shrink-0 border-border border-t px-6 py-4">
          <Button onClick={() => void collect()}>Собрать предложение заново</Button>
        </div>
      )}

      {proposal !== null && company === null && (
        <section className="flex max-h-[60vh] shrink-0 flex-col gap-4 overflow-y-auto border-border border-t px-6 py-4">
          <p>Отрасль: {proposal.industry}</p>
          {proposal.entities.map((entity) => (
            <div key={entity.name} className="flex flex-col gap-2 border-border border-b pb-4">
              <p className="font-medium">{entity.name}</p>
              <p className="text-muted-foreground">{entity.purpose}</p>
              <div className="flex flex-wrap gap-1">
                {entity.fields.map((field) => (
                  <Badge key={field.name} variant="secondary">
                    {field.name}: {field.type}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            {proposal.departments.map((department) => (
              <Badge key={department} variant="outline">
                {department}
              </Badge>
            ))}
          </div>
          <div>
            <Button disabled={busy} onClick={() => void confirm()}>
              Подтвердить и выписать базу
            </Button>
          </div>
        </section>
      )}

      {company !== null && (
        <section className="flex shrink-0 flex-col gap-4 border-border border-t px-6 py-4">
          <p>
            Компания «{company.name}» заведена, база выписывается. Добавьте бота в рабочий чат — он будет присылать
            переписку в панель.
          </p>
          {invitationLink !== null && (
            <a className="underline underline-offset-4" href={invitationLink} target="_blank" rel="noreferrer">
              Добавить бота в рабочий чат
            </a>
          )}
          <Separator />
          <div>
            <Button variant="outline" onClick={() => globalThis.location.assign(`/c/${company.id}`)}>
              К чатам
            </Button>
          </div>
        </section>
      )}

      {asked !== undefined && asked.kind === 'channels' && (
        <div className="shrink-0 border-border border-t px-6 py-4">
          <Questions
            items={[
              {
                id: 'channels',
                type: 'multiple',
                prompt: asked.question,
                required: true,
                options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
              },
            ]}
            onSubmit={(submission) => {
              const picked = submission
                .flatMap((item) => (item.type === 'multiple' ? item.answer : []))
                .map((answer) => String(answer.value))
                .filter((value) => value !== '');
              if (picked.length === 0) return;
              void send(picked.join(' '));
            }}
          >
            <QuestionsHeader>
              <QuestionsTitle />
            </QuestionsHeader>
            <Question id="channels">
              <QuestionOptions>
                {channels.map((channel) => (
                  <QuestionOption key={channel.id} value={channel.id}>
                    <span className="flex items-center gap-2">
                      <ChannelIcon id={channel.id} />
                      {channel.name}
                    </span>
                  </QuestionOption>
                ))}
              </QuestionOptions>
            </Question>
            <QuestionsFooter>
              <QuestionsSubmit>Готово</QuestionsSubmit>
            </QuestionsFooter>
          </Questions>
        </div>
      )}

      {asked !== undefined && asked.kind !== 'channels' && (
        <div className="shrink-0">
          <ChatComposer
            placeholder={asked.hint}
            busy={false}
            onSend={send}
            onSkip={asked.required ? undefined : () => void send('')}
          />
        </div>
      )}
    </main>
  );
}

/** Работа ассистента отдельной репликой: идёт после последнего ответа человека. */
const workTurn = (waiting: boolean): readonly Turn[] => {
  if (!waiting) return [];
  return [
    {
      id: 'proposal-work',
      from: 'assistant',
      text: '',
      at: null,
      typing: false,
      work: { items: workItems(), working: true },
    } satisfies Turn,
  ];
};
