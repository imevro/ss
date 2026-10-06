import { LayoutGridIcon, Message01Icon, SlackIcon, TelegramIcon, WhatsappIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ClientEvent } from '@workspace/types';
import { conversationRoom } from '@workspace/types';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@workspace/ui/components/empty';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@workspace/ui/components/sidebar';
import { useCallback, useEffect, useState } from 'react';
import { Link, redirect, useNavigate, useParams } from 'react-router';

import type { Route } from './+types/page';
import type { Turn } from '@/components/chat';
import { ChatComposer, ChatThread } from '@/components/chat';
import { sessionAddress, shortId } from '@/lib/address';
import { api, reasonOf, serverHeaders } from '@/lib/api';
import { useChatLog } from '@/lib/chat-log';
import type { ChatEvent, ChatMessage, StoredRow, Work } from '@/lib/chat-state';
import { workOfStored } from '@/lib/chat-state';
import { useLiveRoom } from '@/lib/live';
import { noindexMeta } from '@/lib/page-title';

export const meta = () => noindexMeta(['Чаты'], 'Чаты с агентом компании.');

type Conversation = {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly last_message_at: string;
  readonly messages: number;
};

type MiniApp = { readonly id: string; readonly name: string; readonly url: string | null };

const ICONS: Readonly<Record<string, typeof Message01Icon>> = {
  telegram: TelegramIcon,
  slack: SlackIcon,
  whatsapp: WhatsappIcon,
  agent: Message01Icon,
};

const SourceIcon = ({ source }: { readonly source: string }) => {
  const icon = ICONS[source];
  if (icon === undefined) return <HugeiconsIcon icon={Message01Icon} className="size-4 shrink-0" />;
  return <HugeiconsIcon icon={icon} className="size-4 shrink-0" />;
};

/** Время сообщения в понятном виде: сегодня — часы и минуты, раньше — дата. */
const clock = (iso: string): string => {
  const at = new Date(iso);
  const now = new Date();
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  if (sameDay) return at.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  return at.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
};

/** Компания: в адресе она названа слагом, в базе живёт под номером. */
type Company = { readonly id: string; readonly slug: string; readonly name: string };

/** Полный номер открытой записи: он нужен и запросам, и комнате чата. */
const openIdOf = (chat: Conversation | undefined, app: MiniApp | undefined): string | undefined => {
  if (chat !== undefined) return chat.id;
  if (app !== undefined) return app.id;
};

/**
 * Данные экрана приходят с сервера: список чатов, миниаппы и лента открытого чата.
 * Первый же ответ содержит готовую картинку, поэтому пустое окно не мигает.
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  const headers = serverHeaders(request);
  const { company: slug, session } = params;

  const me = await fetch(`${origin}/v1/me`, { headers });
  if (me.status === 401) throw redirect('/login');

  // Компанию в адресе зовут слагом, а база знает её под номером: номер берём из списка.
  const companies = await api<{ companies: readonly Company[] }>(`${origin}/v1/companies`, { headers });
  const company = companies.companies.find((one) => one.slug === slug);
  if (company === undefined) throw new Response('нет такой компании', { status: 404 });

  const conversations = await api<{ conversations: readonly Conversation[] }>(
    `${origin}/v1/companies/${company.id}/conversations`,
    {
      headers,
    },
  );
  const apps = await api<{ apps: readonly MiniApp[] }>(`${origin}/v1/companies/${company.id}/apps`, { headers });

  // Что открыто, решает один номер: он есть и у разговора, и у миниаппа.
  const chat = conversations.conversations.find((one) => shortId(one.id) === session);
  const messages = await messagesOf(origin, headers, company.id, chat?.id);
  return { company, conversations: conversations.conversations, apps: apps.apps, messages };
}

/** Лента открытого разговора. Разговор не открыт — ленты нет. */
const messagesOf = async (
  origin: string,
  headers: Headers,
  companyId: string,
  conversationId: string | undefined,
): Promise<readonly StoredRow[]> => {
  if (conversationId === undefined) return [];
  const data = await api<{ messages: readonly StoredRow[] }>(
    `${origin}/v1/companies/${companyId}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { headers },
  );
  return data.messages;
};

export default function Company({ loaderData }: Route.ComponentProps) {
  const { session } = useParams();
  const companyId = loaderData.company.id;
  const slug = loaderData.company.slug;
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<readonly Conversation[]>(loaderData.conversations);
  const [messages, setMessages] = useState<readonly StoredRow[]>(loaderData.messages);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  /** Открыто то, чей номер стоит в адресе: разговор или миниапп. */
  const activeConversation = conversations.find((chat) => shortId(chat.id) === session);
  const activeApp = loaderData.apps.find((app) => shortId(app.id) === session);
  const openId = openIdOf(activeConversation, activeApp);

  /** Лента собирается переигрыванием журнала: второго пути сборки нет. */
  const log = useChatLog(openId, messages);
  const append = log.append;

  // Открыли другой чат — готовые реплики приходят от загрузчика, журнал свой.
  useEffect(() => {
    setMessages(loaderData.messages);
  }, [loaderData.messages]);

  /** Лента открытого чата приходит целиком: готовые реплики впереди переигранных. */
  const reloadMessages = useCallback(async (): Promise<void> => {
    if (companyId === undefined || openId === undefined) return;
    const data = await api<{ messages: readonly StoredRow[] }>(
      `/v1/companies/${companyId}/conversations/${encodeURIComponent(openId)}/messages`,
    );
    setMessages(data.messages);
  }, [companyId, openId]);

  /**
   * События комнаты ложатся в журнал чата: лента и ход работы выводятся из него.
   * По концу хода лента читается из чата заново — ответ там, а собранный из
   * событий отсеивается при сведении. Строка работы остаётся: она про ход.
   */
  const onEvent = useCallback(
    (event: ClientEvent): void => {
      // Вопрос человека и ход онбординга в комнату чата не приходят.
      if (event.kind === 'proposal' || event.kind === 'problem') return;
      if (event.kind === 'titled') {
        // Имя чата пришло от модели: список обновляется без перезагрузки страницы.
        setConversations((current) =>
          current.map((chat) => {
            if (chat.id !== event.conversationId) return chat;
            return { ...chat, title: event.title };
          }),
        );
        return;
      }
      if (event.kind === 'done') {
        // Номер записи идёт в журнал: по нему собранная реплика уступает записанной.
        append({ kind: 'ended', messageId: event.messageId });
        void reloadMessages();
        return;
      }
      append(eventOfRoom(event));
    },
    [append, reloadMessages],
  );
  useLiveRoom(roomOf(activeConversation?.id), onEvent);

  /** Первое сообщение заводит чат: он появляется в списке и открывается. */
  const startChat = async (text: string): Promise<void> => {
    if (companyId === undefined) return;
    setBusy(true);
    setProblem('');
    try {
      const created = await api<{ conversation: Conversation }>(`/v1/companies/${companyId}/conversations`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setConversations((current) => [created.conversation, ...current]);
      setMessages([
        {
          id: 'local',
          role: 'user',
          text,
          sent_at: new Date().toISOString(),
        },
      ]);
      navigate(sessionAddress(slug, created.conversation.id));
    } catch (error) {
      setProblem(reasonOf(error));
    }
    setBusy(false);
  };

  /** Сообщение в открытый чат. Ответ агента придёт потоком в комнату чата. */
  const writeToChat = async (text: string): Promise<void> => {
    if (companyId === undefined || openId === undefined) return;
    setBusy(true);
    setProblem('');
    try {
      // Вопрос пишем в журнал сразу, с временным номером: он виден, пока идёт запись.
      const temporary = `me-${Date.now()}`;
      append({ kind: 'ask', id: temporary, text, at: new Date().toISOString() });
      const written = await api<{ readonly messageId: string }>(
        `/v1/companies/${companyId}/conversations/${encodeURIComponent(openId)}/messages`,
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      // Запись сделана: вопрос берёт её номер, чтобы пришедшая лента его вытеснила.
      append({ kind: 'asked', id: temporary, messageId: written.messageId });
    } catch (error) {
      setProblem(reasonOf(error));
    }
    setBusy(false);
  };

  const turns: readonly Turn[] = turnsOf(log.state.messages, log.state.work);
  const shownProblem = shownProblemOf(problem, log.state.problem);

  const title = titleOf(activeConversation, activeApp);

  return (
    // Высота окна закреплена: лента прокручивается сама, а строка ввода стоит
    // на месте. Без этого окно росло бы вместе с лентой и уносило строку вниз.
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar>
        <SidebarHeader>
          <Link to="/" className="px-2 py-1 font-heading font-medium">
            s.solutions
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Миниаппы</SidebarGroupLabel>
            <SidebarGroupContent>
              {loaderData.apps.length === 0 && (
                <p className="px-2 py-1 text-muted-foreground">Миниапп появится, когда агент его соберёт.</p>
              )}
              <SidebarMenu>
                {loaderData.apps.map((app) => (
                  <SidebarMenuItem key={app.id}>
                    <SidebarMenuButton isActive={app.id === openId} render={<Link to={sessionAddress(slug, app.id)} />}>
                      <HugeiconsIcon icon={LayoutGridIcon} className="size-4 shrink-0" />
                      <span className="truncate">{app.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Чаты</SidebarGroupLabel>
            <SidebarGroupContent>
              {conversations.length === 0 && (
                <p className="px-2 py-1 text-muted-foreground">Напишите боту или начните разговор справа.</p>
              )}
              <SidebarMenu>
                {conversations.map((conversation) => (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      isActive={conversation.id === openId}
                      render={<Link to={sessionAddress(slug, conversation.id)} />}
                    >
                      <SourceIcon source={conversation.source} />
                      <span className="truncate">{conversation.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="flex min-h-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-border border-b px-4">
          <SidebarTrigger />
          <SourceIcon source={sourceOf(activeConversation)} />
          <span className="truncate font-medium">{title}</span>
        </header>

        {shownProblem !== '' && <p className="shrink-0 px-6 py-2 text-destructive">{shownProblem}</p>}

        {activeApp !== undefined && activeApp.url === null && (
          <div className="flex flex-1 items-center justify-center px-6">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Миниапп ещё собирается</EmptyTitle>
                <EmptyDescription>Адрес появится, когда сборка закончится.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {activeApp !== undefined && activeApp.url !== null && (
          <iframe title={activeApp.name} src={activeApp.url} className="min-h-0 flex-1 border-0" />
        )}

        {activeConversation !== undefined && (
          <>
            <ChatThread turns={turns} />
            <div className="mx-auto w-full max-w-3xl shrink-0">
              <ChatComposer placeholder="Написать сообщение" busy={busy} onSend={writeToChat} />
            </div>
          </>
        )}

        {activeApp === undefined && activeConversation === undefined && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
            <div className="flex w-full max-w-xl flex-col gap-3">
              <h1 className="font-heading font-medium text-2xl">С чего начнём?</h1>
              <p className="text-muted-foreground">Напишите, что нужно узнать или собрать. Ответ придёт в этот чат.</p>
              <ChatComposer placeholder="Написать сообщение" busy={busy} onSend={startChat} />
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Лента из состояния. Строка работы у каждого ответа своя: у идущего — живой ход,
 * у готового — ход из записи. Поэтому она одна и та же до и после обновления страницы.
 */
const turnsOf = (messages: readonly ChatMessage[], work: Work | null): readonly Turn[] => {
  const last = messages.at(-1);
  const running = work !== null && work.endedAt === null;
  return messages.map((message) => {
    // Печатается и несёт строку работы только ответ агента: строка — про его
    // работу, и место ей слева. Вопрос человека ничего этого не показывает.
    const typing = running && message === last && message.role === 'assistant';
    return {
      id: message.id,
      from: message.role,
      text: message.text,
      at: clock(message.at),
      typing,
      blocks: message.blocks,
      workLine: lineFor(message, typing, work),
    };
  });
};

/**
 * Строка работы реплики. Идёт ход — строка живая, она у идущего ответа. Ход кончился —
 * строка берётся из записи: та же до и после обновления страницы. Нет хода — нет строки.
 */
const lineFor = (message: ChatMessage, typing: boolean, work: Work | null): Work | undefined => {
  if (typing && work !== null) return work;
  if (message.storedWork === undefined) return;
  return workOfStored(message.storedWork, message.at);
};

/** Ошибка страницы важнее ошибки чата: свежая весть заменяет прошлую. */
const shownProblemOf = (page: string, chat: string): string => {
  if (page !== '') return page;
  return chat;
};

/** Событие комнаты становится событием чата: чат — это её дела, не экран. */
const eventOfRoom = (event: ClientEvent): ChatEvent => {
  if (event.kind === 'started') return { kind: 'started', messageId: event.messageId };
  if (event.kind === 'chunk') return { kind: 'chunk', text: event.text };
  if (event.kind === 'live') return { kind: 'live', calls: event.calls, thinking: event.thinking };
  if (event.kind === 'thought') return { kind: 'thought' };
  if (event.kind === 'failed') return { kind: 'failed', reason: event.reason };
  return { kind: 'ended' };
};

/** Комната открытого разговора. Пустое окно комнаты не имеет. */
const roomOf = (conversationId: string | undefined): string | null => {
  if (conversationId === undefined) return null;
  return conversationRoom(conversationId);
};

const sourceOf = (conversation: Conversation | undefined): string => {
  if (conversation === undefined) return 'agent';
  return conversation.source;
};

const titleOf = (conversation: Conversation | undefined, app: MiniApp | undefined): string => {
  if (conversation !== undefined) return conversation.title;
  if (app !== undefined) return app.name;
  return 'Чаты';
};
