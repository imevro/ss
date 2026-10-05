import type { AgentActivityItem } from '@workspace/ui/components/agents/agent-activity';
import { AgentActivity } from '@workspace/ui/components/agents/agent-activity';
import { Button } from '@workspace/ui/components/button';
import { Message, MessageContent, MessageMarkdown, MessageStack } from '@workspace/ui/components/nexus-ui/message';
import {
  PromptInput,
  PromptInputAction,
  PromptInputActionGroup,
  PromptInputActions,
  PromptInputTextarea,
} from '@workspace/ui/components/prompt-input';
import { Thread, ThreadContent, ThreadScrollToBottom } from '@workspace/ui/components/thread';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { WorkLine } from './work-line';
import type { ChatBlock, Work } from '@/lib/chat-state';

/**
 * Лента переписки и строка ввода. Одна форма на все места, где человек говорит
 * с системой: онбординг и чат с ассистентом. Состояние ленты приходит снаружи.
 */
export type Turn = {
  readonly id: string;
  /** Кто говорит: человек или ассистент. Лицо задаёт вид сообщения. */
  readonly from: 'user' | 'assistant';
  readonly text: string;
  /** Когда написано. Нет времени — подписи нет. */
  readonly at: string | null;
  /** Ответ печатается на глазах: так отвечает ассистент. */
  readonly typing: boolean;
  /** Части ответа по порядку. Есть — текст берётся из них, а не из целого. */
  readonly blocks?: readonly ChatBlock[] | undefined;
  /** Работа ассистента: шаги, которые он проходит внутри этого ответа. */
  readonly work?: { readonly items: readonly AgentActivityItem[]; readonly working: boolean } | undefined;
  /** Ход работы агента: одна строка с инструментами и временем. */
  readonly workLine?: Work | undefined;
};

/** Скорость печати: букв в секунду. Одна на все места. */
const CHARS_PER_SECOND = 110;

/** Пределы времени печати: короткий вопрос не мелькает, длинный ответ не тянется. */
const MIN_TYPE_MS = 350;
const MAX_TYPE_MS = 1600;

/** Время печати текста: скорость задаёт буква, а не слово. */
const typeMs = (total: number): number => {
  const byRate = (total / CHARS_PER_SECOND) * 1000;
  return Math.min(MAX_TYPE_MS, Math.max(MIN_TYPE_MS, byRate));
};

/** Сколько букв показать сразу: печатаем — ничего, иначе весь текст. */
const shownAtStart = (typing: boolean, instant: boolean, total: number): number => {
  if (!typing || instant) return total;
  return 0;
};

/** Идёт печать — поток; печать кончилась — готовый текст. */
const modeOf = (printing: boolean): 'streaming' | 'static' => {
  if (printing) return 'streaming';
  return 'static';
};

/**
 * Часть ответа печатается ровно: буквы проявляются одна за другой, без рывков.
 * Скорость одна на любой текст — печать показывает, что ответ пришёл, а не украшает.
 */
const TypedMarkdown = ({ text, typing }: { readonly text: string; readonly typing: boolean }) => {
  const handle = useRef(0);
  const total = text.length;
  // Ответ на вопрос «меньше движения» даёт готовая ловушка движения: на сервере она
  // отвечает «нет», в браузере перечитывает настройку — разметка не расходится.
  const still = useReducedMotion();
  const instant = still === true;
  const [shown, setShown] = useState(() => shownAtStart(typing, instant, total));
  const shownRef = useRef(shown);

  useEffect(() => {
    if (!typing || instant) return;
    const from = Math.min(shownRef.current, total);
    const startedAt = performance.now();
    const span = typeMs(total - from);
    const frame = (now: number): void => {
      const passed = (now - startedAt) / span;
      const share = Math.min(1, Math.max(0, passed));
      const next = Math.max(from, from + Math.round((total - from) * share));
      shownRef.current = next;
      setShown(next);
      if (share < 1) handle.current = requestAnimationFrame(frame);
    };
    handle.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle.current);
  }, [typing, instant, total]);

  // Печатаем только идущий ответ, и только до уже пришедшего текста: кусок мог
  // доехать позже, чем кончилась прошлая печать, — тогда он показывается целиком.
  const printing = typing && !instant && shown < total;
  const visible = visibleOf(printing, shown, total);
  return (
    <MessageMarkdown mode={modeOf(printing)} aria-busy={printing}>
      {text.slice(0, visible)}
    </MessageMarkdown>
  );
};

/** Сколько букв видно: печатаем — до напечатанного, иначе весь текст. */
const visibleOf = (printing: boolean, shown: number, total: number): number => {
  if (printing) return Math.min(shown, total);
  return total;
};

/** Лента переписки. Последнее сообщение всегда видно: лента сама держится низа. */
export const ChatThread = ({
  turns,
  contentClassName = 'mx-auto w-full max-w-3xl',
}: {
  readonly turns: readonly Turn[];
  /** Ширина строки: по умолчанию лента держится колонки, а не краёв окна. */
  readonly contentClassName?: string;
}) => (
  <Thread className="no-scrollbar min-h-0 flex-1">
    <ThreadContent className={contentClassName}>
      {turns.map((turn) => (
        <Message key={turn.id} from={turn.from}>
          <MessageStack>
            <MessageContent>
              {turn.workLine !== undefined && <WorkLine work={turn.workLine} className="mb-1" />}
              {/* Человек пишет простым текстом: перенос строки, который он поставил,
                  так и показывается. Разметка здесь не разбирается — её нет в вопросе. */}
              {turn.from === 'user' && <p className="whitespace-pre-wrap break-words">{turn.text}</p>}
              {turn.from === 'assistant' &&
                (turn.blocks === undefined
                  ? turn.text !== '' && <MessageMarkdown mode="static">{turn.text}</MessageMarkdown>
                  : turn.blocks.map((block, index) => (
                      <TypedMarkdown key={`${turn.id}-${index}`} text={block.text} typing={turn.typing} />
                    )))}
              {turn.work !== undefined && (
                <AgentActivity
                  items={[...turn.work.items]}
                  status={turn.work.working ? 'working' : 'complete'}
                  contentType="step"
                  className="pt-1"
                />
              )}
            </MessageContent>
            {turn.at !== null && <p className="px-2 text-muted-foreground">{turn.at}</p>}
          </MessageStack>
        </Message>
      ))}
    </ThreadContent>
    <ThreadScrollToBottom />
  </Thread>
);

/** Строка ввода. Enter отправляет, Shift+Enter переносит строку. */
export const ChatComposer = ({
  placeholder,
  busy,
  onSend,
  onSkip,
}: {
  readonly placeholder: string;
  readonly busy: boolean;
  readonly onSend: (text: string) => Promise<void>;
  /** Пропуск шага. Шаг обязательный — пропуска нет. */
  readonly onSkip?: (() => void) | undefined;
}) => {
  const [draft, setDraft] = useState('');

  const send = (text: string): void => {
    const message = text.trim();
    if (message === '' || busy) return;
    setDraft('');
    void onSend(message);
  };

  return (
    <div className="mb-4">
      <PromptInput onSubmit={send}>
        <PromptInputTextarea
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
        <PromptInputActions>
          <PromptInputActionGroup>
            {onSkip !== undefined && (
              <Button variant="ghost" disabled={busy} onClick={onSkip}>
                Пропустить
              </Button>
            )}
          </PromptInputActionGroup>
          <PromptInputAction>
            <Button disabled={busy || draft.trim() === ''} onClick={() => send(draft)}>
              Отправить
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
};
