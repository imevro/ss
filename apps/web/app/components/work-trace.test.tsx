/**
 * Проверка отрисовки хода работы: круг идущий показывает Trace по вызовам, круг
 * закрытый — одну короткую строку. Проверка статичная: разметку собирает
 * `renderToStaticMarkup`, браузера нет.
 *
 * Запуск: bun test app/components/work-trace.test.tsx
 */
import { describe, expect, test } from 'bun:test';

import type { ChatBlock } from '@workspace/types';
import { renderToStaticMarkup } from 'react-dom/server';

import { WorkTrace } from './work-trace';

type WorkBlock = Extract<ChatBlock, { readonly type: 'work' }>;

const at = (seconds: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

/** Закрытый круг: двенадцать секунд, два вызова, три мысли. */
const closed: WorkBlock = {
  type: 'work',
  calls: [
    { name: 'bash', intent: 'Смотрю файлы' },
    { name: 'bash', intent: 'Ищу схему' },
  ],
  thoughts: 3,
  thinking: false,
  startedAt: at(0),
  endedAt: at(12),
};

/** Идущий круг: один вызов, конца нет. */
const running: WorkBlock = {
  type: 'work',
  calls: [{ name: 'read', intent: 'Читаю схему' }],
  thoughts: 0,
  thinking: true,
  startedAt: at(0),
  endedAt: null,
};

describe('ход работы', () => {
  test('закрытый круг даёт короткую строку, а не Trace', () => {
    const html = renderToStaticMarkup(<WorkTrace block={closed} expanded={false} running={false} />);
    expect(html).toContain('data-slot="work-line"');
    expect(html).toContain('Worked for <span class="tabular-nums">12s</span>');
    expect(html).toContain('Bash');
    expect(html).toContain('×2');
    expect(html).toContain('thoughts');
    expect(html).not.toContain('data-slot="trace"');
  });

  test('идущий круг раскрыт: Trace, идущая строка и замысел вызова', () => {
    const html = renderToStaticMarkup(<WorkTrace block={running} expanded running />);
    expect(html).toContain('data-slot="trace"');
    expect(html).toContain('data-status="running"');
    expect(html).toContain('Читаю схему');
    expect(html).toContain('Работаю');
    expect(html).not.toContain('data-slot="work-line"');
  });

  test('круг без вызовов и мыслей в Trace показывает, что работа идёт', () => {
    const quiet: WorkBlock = { ...running, calls: [] };
    const html = renderToStaticMarkup(<WorkTrace block={quiet} expanded running />);
    expect(html).toContain('Работаю…');
    expect(html).toContain('data-status="running"');
  });
});
