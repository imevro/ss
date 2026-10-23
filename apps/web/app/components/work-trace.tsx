/**
 * Ход работы агента: круг инструментов в ответе. Пока круг идёт — полный Trace
 * (каждый вызов по порядку, активная строка мерцает самим Trace). Круг кончился —
 * одна короткая строка: сколько шёл, что позвал, сколько думал.
 *
 * Данные приходят блоком ответа, а не отдельной сводкой: счёт ведёт сведение журнала,
 * поэтому строка одна и та же до и после обновления страницы.
 */
import {
  ComputerTerminal01Icon,
  File01Icon,
  PencilEdit01Icon,
  SparklesIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ChatBlock, ToolCall } from '@workspace/types';
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from '@workspace/ui/components/trace';
import { cn } from '@workspace/ui/lib/utils';
import { useEffect, useState } from 'react';

/** Круг хода: блок ответа этого вида. */
type WorkBlock = Extract<ChatBlock, { readonly type: 'work' }>;

/** Значок инструмента: по имени, а незнакомый — гаечный ключ. */
const iconOf = (name: string) => {
  if (name === 'read') return File01Icon;
  if (name === 'edit' || name === 'write') return PencilEdit01Icon;
  if (name === 'run' || name === 'bash') return ComputerTerminal01Icon;
  return Wrench01Icon;
};

/**
 * Имя инструмента как его читает человек: первая буква большая, подчёркивания —
 * пробелами. `web_search` в строке выглядит как «Web search».
 */
export const shownName = (name: string): string => {
  const spaced = name.replace(/_/g, ' ');
  const first = spaced.slice(0, 1).toUpperCase();
  return first + spaced.slice(1);
};

/** Один инструмент в короткой строке: имя и, если звали не раз, число. */
type Group = { readonly name: string; readonly count: number };

/** Сколько прошлых инструментов показывает короткая строка. Дальше история уходит. */
const HISTORY_LIMIT = 2;

/** Инструменты, которые уже позади. Идёт круг — последний вызов ещё работает. */
const historyOf = (calls: readonly ToolCall[], running: boolean): readonly ToolCall[] => {
  if (!running) return calls;
  return calls.slice(0, Math.max(0, calls.length - 1));
};

/** Имена по первому появлению: повтор имени второй записи не даёт. */
const namesOf = (calls: readonly ToolCall[]): readonly string[] =>
  calls.flatMap((call, index) => {
    const first = calls.findIndex((other) => other.name === call.name);
    if (first !== index) return [];
    return [call.name];
  });

// Перебор по списку: за круг инструментов десятки, а не тысячи. Появится тысяча —
// счёт по карте имён; сейчас карта стоила бы дороже, чем экономила.
const countOf = (calls: readonly ToolCall[], name: string): number => calls.filter((call) => call.name === name).length;

/**
 * Список инструментов сжимается по имени: один и тот же инструмент даёт одну запись
 * «×N», где бы он ни стоял. Порядок первого появления сохраняется, показываются
 * последние два: строка не растёт вместе с ходом.
 */
const groupsOf = (calls: readonly ToolCall[], running: boolean): readonly Group[] => {
  const history = historyOf(calls, running);
  return namesOf(history)
    .map((name) => ({ name, count: countOf(history, name) }))
    .slice(-HISTORY_LIMIT);
};

/** Секунды как их пишет omp: до минуты — «27s», дальше «1m 39s». */
const elapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return `${minutes}m`;
  return `${minutes}m ${rest}s`;
};

/** Сколько шёл круг. Круг кончился — считаем по его концам. */
const secondsOf = (block: WorkBlock, now: number): number => {
  const from = Date.parse(block.startedAt);
  if (block.endedAt === null) return Math.max(0, Math.round((now - from) / 1000));
  return Math.max(0, Math.round((Date.parse(block.endedAt) - from) / 1000));
};

/** Круг идёт — тикаем раз в секунду. Стоит — часов не заводим. */
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

/**
 * Признак строки Trace. Только последняя строка идущего круга — идущая; остальные
 * строки уже позади и мерцать не должны.
 */
const statusOfLine = (last: boolean, running: boolean): 'running' | undefined => {
  if (!last) return;
  if (!running) return;
  return 'running';
};

/** Первая строка Trace: круг идёт — «Работаю», кончился — «Работал». */
const headOf = (block: WorkBlock, running: boolean, seconds: number): string => {
  if (running) return `Работаю ${elapsed(seconds)}`;
  return `Работал ${elapsed(seconds)}`;
};

/** Вызов одной строкой: имя и замысел. */
const callLineOf = (call: ToolCall): string => `${shownName(call.name)} — ${call.intent}`;

/**
 * Полный ход: каждое действие по порядку, пока круг не кончился. Круг без вызовов и
 * без мыслей — одна строка «Работаю…»: показывать нечего, кроме самого хода.
 */
const RunningTrace = ({ block, running }: { readonly block: WorkBlock; readonly running: boolean }) => {
  const now = useTick(running);
  const seconds = secondsOf(block, now);
  const lastIndex = block.calls.length - 1;
  if (block.calls.length === 0 && block.thoughts === 0) {
    return (
      <Trace>
        <TraceLine status={statusOfLine(true, running)}>
          <TraceIcon>
            <HugeiconsIcon icon={SparklesIcon} />
          </TraceIcon>
          <TraceTitle>Работаю…</TraceTitle>
        </TraceLine>
      </Trace>
    );
  }

  return (
    <Trace>
      <TraceLine>
        <TraceIcon>
          <HugeiconsIcon icon={SparklesIcon} />
        </TraceIcon>
        <TraceTitle>{headOf(block, running, seconds)}</TraceTitle>
      </TraceLine>
      {block.calls.map((call, index) => (
        <TraceLine key={`${index}-${call.name}`} status={statusOfLine(index === lastIndex, running)}>
          <TraceIcon>
            <HugeiconsIcon icon={iconOf(call.name)} />
          </TraceIcon>
          <TraceTitle>{callLineOf(call)}</TraceTitle>
        </TraceLine>
      ))}
      {block.thoughts > 0 && (
        <TraceLine>
          <TraceIcon>
            <HugeiconsIcon icon={SparklesIcon} />
          </TraceIcon>
          <TraceTitle>Мысли</TraceTitle>
          <TraceDescription>×{block.thoughts}</TraceDescription>
        </TraceLine>
      )}
    </Trace>
  );
};

/** Короткая строка закрытого круга: время, инструменты, мысли. */
const ClosedLine = ({ block }: { readonly block: WorkBlock }) => {
  const seconds = secondsOf(block, Date.now());
  const groups = groupsOf(block.calls, false);
  const thoughts = block.thoughts;

  return (
    <output data-slot="work-line" className="flex items-center gap-1.5 text-base text-muted-foreground">
      <span className="shrink-0">
        Worked for <span className="tabular-nums">{elapsed(seconds)}</span>
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
      {thoughts > 0 && (
        <span className="flex shrink-0 items-center gap-1.5">
          <span aria-hidden="true">•</span>
          <span>
            <span className="tabular-nums">{thoughts}</span> {thoughts === 1 ? 'thought' : 'thoughts'}
          </span>
        </span>
      )}
    </output>
  );
};

/**
 * Ход одного круга. Идёт — Trace по каждому вызову; кончился — короткая строка.
 * `expanded` важнее `running`: после обновления посреди хода круг остаётся раскрытым,
 * даже если стрим уже не тянет часы сам.
 */
export const WorkTrace = ({
  block,
  expanded,
  running,
  className,
}: {
  readonly block: WorkBlock;
  readonly expanded: boolean;
  readonly running: boolean;
  readonly className?: string;
}) => {
  if (!expanded) return <ClosedLine block={block} />;
  return (
    <div className={cn('min-w-0', className)}>
      <RunningTrace block={block} running={running} />
    </div>
  );
};
