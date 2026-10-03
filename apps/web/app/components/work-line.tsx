'use client';

/**
 * Строка хода работы агента. Одна строка на весь ход: что позвал, сколько думал,
 * сколько идёт. Пока идёт — «Working for …», после — «Worked for …».
 *
 * Собирается из состояния, а не ведёт счёт сама: список позванных инструментов
 * приходит целиком, число мыслей считает сведение журнала. Часы идут от начала
 * хода: тиканье раз в секунду, а не плавная полоса — время и есть содержание.
 */
import { TextShimmer } from '@workspace/ui/components/nexus-ui/text-shimmer';
import { cn } from '@workspace/ui/lib/utils';
import { useEffect, useState } from 'react';

import type { Work } from '@/lib/chat-state';

/** Один инструмент в строке: имя и, если звали не раз, число. */
type Group = { readonly name: string; readonly count: number };

/**
 * Имя инструмента как его читает человек: первая буква большая, подчёркивания —
 * пробелами. `web_search` в строке выглядит как «Web search».
 */
export const shownName = (name: string): string => {
  const spaced = name.replace(/_/g, ' ');
  const first = spaced.slice(0, 1).toUpperCase();
  return first + spaced.slice(1);
};

/** Сколько прошлых инструментов показывает строка. Дальше история уходит. */
const HISTORY_LIMIT = 2;

/**
 * Список инструментов сжимается по имени: один и тот же инструмент даёт одну
 * запись «×N», где бы он ни стоял в ходе. Порядок первого появления сохраняется —
 * строка читается как ход работы, а не как журнал вызовов.
 *
 * Показываются только последние два инструмента: строка не растёт вместе с ходом.
 * Идущий ход показывает активный инструмент отдельно — он из истории исключён.
 */
const groupsOf = (calls: readonly { readonly name: string }[], running: boolean): readonly Group[] => {
  const history = historyOf(calls, running);
  return namesOf(history)
    .map((name) => ({ name, count: countOf(history, name) }))
    .slice(-HISTORY_LIMIT);
};

/** Инструменты, которые уже позади. Идёт ход — последний вызов ещё работает. */
const historyOf = (
  calls: readonly { readonly name: string }[],
  running: boolean,
): readonly { readonly name: string }[] => {
  if (!running) return calls;
  return calls.slice(0, Math.max(0, calls.length - 1));
};

/** Имена по первому появлению: повтор имени второй записи не даёт. */
const namesOf = (calls: readonly { readonly name: string }[]): readonly string[] =>
  calls.flatMap((call, index) => {
    const first = calls.findIndex((other) => other.name === call.name);
    if (first !== index) return [];
    return [call.name];
  });

// Перебор по списку: за ход инструментов десятки, а не тысячи. Появится тысяча —
// счёт по карте имён; сейчас карта стоила бы дороже, чем экономила.
const countOf = (calls: readonly { readonly name: string }[], name: string): number =>
  calls.filter((call) => call.name === name).length;

/** Секунды как их пишет omp: до минуты — «27s», дальше «1m 39s». */
const elapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return `${minutes}m`;
  return `${minutes}m ${rest}s`;
};

/** Сколько идёт ход на этих часах. Ход кончился — считаем по его концам. */
const secondsOf = (work: Work, now: number): number => {
  const from = Date.parse(work.startedAt);
  if (work.endedAt === null) return Math.max(0, Math.round((now - from) / 1000));
  return Math.max(0, Math.round((Date.parse(work.endedAt) - from) / 1000));
};

/** Строка идёт — тикаем раз в секунду. Стоит — часов не заводим. */
const useTick = (running: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [running]);
  return now;
};

/** Часть строки, которую показывает мерцание: так видно, что работа идёт. */
const currentOf = (work: Work): string => {
  if (work.thinking) return 'Thinking…';
  const last = work.calls.at(-1);
  if (last === undefined) return 'Working…';
  return last.intent;
};

export const WorkLine = ({ work, className }: { readonly work: Work; readonly className?: string }) => {
  const running = work.endedAt === null;
  const now = useTick(running);
  const seconds = secondsOf(work, now);
  const groups = groupsOf(work.calls, running);
  const thoughts = work.thoughts;

  return (
    <output
      data-slot="work-line"
      aria-busy={running}
      className={cn('flex items-center gap-1.5 text-base text-muted-foreground', className)}
    >
      <span className="shrink-0">
        {running ? 'Working for ' : 'Worked for '}
        <span className="tabular-nums">{elapsed(seconds)}</span>
      </span>
      {groups.map((group) => (
        <span key={group.name} className="flex shrink-0 items-center gap-1.5">
          <span aria-hidden="true">•</span>
          <span>
            {shownName(group.name)}
            {group.count > 1 && <span className="tabular-nums"> ×{group.count}</span>}
          </span>
        </span>
      ))}
      {!running && thoughts > 0 && (
        <span className="flex shrink-0 items-center gap-1.5">
          <span aria-hidden="true">•</span>
          <span>
            <span className="tabular-nums">{thoughts}</span> {thoughts === 1 ? 'thought' : 'thoughts'}
          </span>
        </span>
      )}
      {running && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true">•</span>
          {/* Мерцание из реестра: идёт — значит, работа идёт. Строка стоит, мерцания нет. */}
          <TextShimmer className="truncate">{currentOf(work)}</TextShimmer>
        </span>
      )}
    </output>
  );
};
