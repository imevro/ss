import type { ChatBlock } from '@workspace/types';
import { Bubble, BubbleContent } from '@workspace/ui/components/bubble';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@workspace/ui/components/input-group';
import { Markdown } from '@workspace/ui/components/markdown';
import { Message, MessageContent, MessageFooter } from '@workspace/ui/components/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@workspace/ui/components/message-scroller';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { WorkTrace } from './work-trace';

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
  /** Ход идёт по любой правде: живой журнал или запись. Тогда круг раскрыт. */
  readonly expanded: boolean;
  /** Части ответа по порядку: слова и круги работы в том виде, как они были. */
  readonly blocks: readonly ChatBlock[];
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

/** Сколько букв видно: печатаем — до напечатанного, иначе весь текст. */
const visibleOf = (printing: boolean, shown: number, total: number): number => {
  if (printing) return Math.min(shown, total);
  return total;
};

/**
 * Часть ответа печатается ровно: буквы проявляются одна за другой, без рывков.
 * Скорость одна на любой текст — печать показывает, что ответ пришёл, а не украшает.
 */
const TypedMarkdown = ({ text, typing }: { readonly text: string; readonly typing: boolean }) => {
  const handle = useRef(0);
  const total = text.length;
  const still = useReducedMotion();
  /**
   * Печать без движения: решается в браузере, но не на первой отрисовке. На сервере
   * настройку не спросить, и там «нет», так что спрашиваем её эффектом — иначе
   * сервер и браузер показали бы разное, и разметка разошлась бы при оживлении.
   */
  const [instant, setInstant] = useState(false);
  const [shown, setShown] = useState(() => shownAtStart(typing, false, total));
  const shownRef = useRef(shown);

  useEffect(() => {
    setInstant(still === true);
  }, [still]);

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
    <div data-slot="typed-markdown" aria-busy={printing}>
      <Markdown mode={modeOf(printing)}>{text.slice(0, visible)}</Markdown>
    </div>
  );
};

/** Имя реплики для чтения вслух: по ролям, по-русски. */
const labelOf = (from: Turn['from']): string => {
  if (from === 'user') return 'Вопрос человека';
  return 'Ответ агента';
};

/** Сторона реплики: вопрос человека справа, ответ агента слева. */
const alignOf = (from: Turn['from']): 'start' | 'end' => {
  if (from === 'user') return 'end';
  return 'start';
};

/** Сторона подписи с временем: она держится своей стороны реплики. */
const footerSideOf = (from: Turn['from']): string => {
  if (from === 'user') return 'self-end';
  return 'self-start';
};

/** Номер последнего текстового блока: печатается только он. */
const lastTextIndex = (blocks: readonly ChatBlock[]): number => blocks.findLastIndex((block) => block.type === 'text');

/** Одна часть ответа: слова печатаются, круг работы показывает Trace или строку. */
const BlockView = ({
  block,
  index,
  turn,
}: {
  readonly block: ChatBlock;
  readonly index: number;
  readonly turn: Turn;
}) => {
  if (block.type === 'text') {
    const printing = turn.typing && index === lastTextIndex(turn.blocks);
    return <TypedMarkdown text={block.text} typing={printing} />;
  }
  return (
    <WorkTrace block={block} expanded={turn.expanded} running={turn.expanded && index === turn.blocks.length - 1} />
  );
};

/** Лента переписки. Последнее сообщение всегда видно: лента сама держится низа. */
export const ChatThread = ({ turns }: { readonly turns: readonly Turn[] }) => (
  <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
    <MessageScroller className="min-h-0 flex-1">
      <MessageScrollerViewport>
        <MessageScrollerContent
          aria-busy={turns.some((turn) => turn.typing)}
          className="mx-auto w-full max-w-3xl px-6 py-6"
        >
          {turns.map((turn) => (
            <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor={turn.from === 'user'}>
              <Message align={alignOf(turn.from)} aria-label={labelOf(turn.from)}>
                <MessageContent>
                  {/* Человек пишет простым текстом: перенос строки, который он поставил,
                      так и показывается. Разметка здесь не разбирается — её нет в вопросе. */}
                  {turn.from === 'user' && (
                    <Bubble align="end" variant="muted">
                      <BubbleContent>
                        <p className="whitespace-pre-wrap break-words">{turn.text}</p>
                      </BubbleContent>
                    </Bubble>
                  )}
                  {turn.from === 'assistant' &&
                    turn.blocks.map((block, index) => (
                      <BlockView key={`${turn.id}-${index}`} block={block} index={index} turn={turn} />
                    ))}
                  {/* Время стоит под репликой, а не сбоку: боковое место занимает
                      лента, и подпись уезжала бы к противоположному краю. */}
                  {turn.at !== null && <MessageFooter className={footerSideOf(turn.from)}>{turn.at}</MessageFooter>}
                </MessageContent>
              </Message>
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  </MessageScrollerProvider>
);

/** Строка ввода. Enter отправляет, Shift+Enter переносит строку. */
export const ChatComposer = ({
  placeholder,
  queued = [],
  onSend,
  onFlush,
}: {
  readonly placeholder: string;
  /** Вопросы, ждущие хода агента. В ленте их нет: они ещё не отправлены. */
  readonly queued?: readonly Queued[];
  readonly onSend: (text: string) => Promise<void>;
  /** Пустой Enter пускает верхний вопрос очереди сейчас. */
  readonly onFlush?: (() => void) | undefined;
}) => {
  const [draft, setDraft] = useState('');

  /**
   * Enter: с текстом — вопрос уходит, пустой — верхний вопрос очереди уходит сейчас.
   * Агент занят — вопрос встанет в очередь: очередь видна, а лента не врёт.
   */
  const send = (text: string): void => {
    const message = text.trim();
    if (message === '') {
      if (queued.length > 0) onFlush?.();
      return;
    }
    setDraft('');
    void onSend(message);
  };

  const empty = draft.trim() === '' && queued.length === 0;

  return (
    <div className="mb-4">
      {queued.length > 0 && <QueuedQuestions items={queued} />}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton type="submit" disabled={empty} className="ml-auto">
              Отправить
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
};

/** Вопрос, ждущий хода агента, со своим именем. Одинаковые вопросы различимы: имя своё. */
export type Queued = { readonly id: string; readonly text: string };

/** Вопросы, ждущие хода агента: человек их написал, но агент их ещё не получил. */
const QueuedQuestions = ({ items }: { readonly items: readonly Queued[] }) => (
  <div className="mb-2 px-3 text-muted-foreground">
    <ol className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.id} className="truncate">
          {item.text}
        </li>
      ))}
    </ol>
    <p>Enter отправит верхний вопрос сейчас.</p>
  </div>
);
