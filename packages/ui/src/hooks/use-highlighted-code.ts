import { type CodeHighlighter, loadHighlighter } from '@workspace/ui/lib/highlighter';
import * as React from 'react';

/** Код без последнего перевода строки: иначе он даёт лишнюю пустую строку. */
const trimmed = (value: string): string => {
  if (value.endsWith('\n')) return value.slice(0, -1);
  return value;
};

/** Загруженная подсветка вместе с языком: подсветка от другого языка не годится. */
type Loaded = { readonly language: string; readonly highlighter: CodeHighlighter | null };

/** Строки, уже подсвеченные: дописывается только хвост, начало не пересчитывается. */
type Done = {
  readonly highlighter: CodeHighlighter | null;
  /** Начало кода, подсвеченное законченными строками. */
  readonly text: string;
  readonly lines: readonly React.ReactNode[];
  readonly state: Parameters<CodeHighlighter['highlight']>[1];
};

const emptyDone: Done = { highlighter: null, text: '', lines: [], state: undefined };

/** Подсветка для этого языка. Язык другой — подсветки ещё нет. */
const highlighterOf = (loaded: Loaded | null, language: string): CodeHighlighter | null => {
  if (loaded === null) return null;
  if (loaded.language !== language) return null;
  return loaded.highlighter;
};

/** Начало подсветки. Код переписан с начала — пересчитываем всё. */
const baseOf = (done: Done, highlighter: CodeHighlighter | null, code: string): Done => {
  if (done.highlighter !== highlighter) return emptyDone;
  if (!code.startsWith(done.text)) return emptyDone;
  return done;
};

/**
 * Подсветка законченных строк. Начало кода остаётся тем же, поэтому пересчитывается
 * только дописанное, а последняя строка считается на каждой отрисовке — она пишется.
 */
const grownOf = (highlighter: CodeHighlighter | null, code: string, base: Done, end: number): Done => {
  if (highlighter === null) return base;
  if (end <= base.text.length) return base;
  const added = highlighter.highlight(code.slice(base.text.length, end - 1), base.state);
  return { highlighter, text: code.slice(0, end), lines: [...base.lines, ...added.lines], state: added.state };
};

/**
 * Подсветка кода по кускам. На сервере подсветки нет: хук отдаёт простой текст,
 * поэтому первая отрисовка остаётся серверной, а подсветка приходит после оживления.
 */
export function useHighlightedCode(value: string, language: string): readonly React.ReactNode[] {
  const code = trimmed(value);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const highlighter = highlighterOf(loaded, language);

  React.useEffect(() => {
    const cancelled = { current: false };
    loadHighlighter(language)
      .then((next) => {
        if (cancelled.current) return;
        setLoaded({ language, highlighter: next });
      })
      // Грамматика не загрузилась — блок покажет простой текст: ответ важнее подсветки.
      .catch(() => setLoaded({ language, highlighter: null }));

    return () => {
      cancelled.current = true;
    };
  }, [language]);

  const [done, setDone] = React.useState<Done>(emptyDone);

  // Хвост — всё после последнего перевода строки: он ещё пишется.
  const end = code.lastIndexOf('\n') + 1;
  const grown = grownOf(highlighter, code, baseOf(done, highlighter, code), end);
  if (grown !== done) setDone(grown);

  const tail = code.slice(end);

  return React.useMemo(() => {
    if (highlighter === null) return code.split('\n');
    return [...grown.lines, ...highlighter.highlight(tail, grown.state).lines.slice(0, 1)];
  }, [code, highlighter, grown, tail]);
}
