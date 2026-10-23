import type * as React from 'react';
import { createHighlighterCore, type GrammarState, type HighlighterCore, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** Языки, которые подсвечиваем. Каждый грузится при первом использовании. */
const languages = {
  bash: () => import('shiki/langs/shellscript.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
} as const;

type Language = keyof typeof languages;

/** Короткие имена: в фенсед-блоках пишут `ts`, `sh`, `py`. */
const aliases: Record<string, Language> = {
  js: 'javascript',
  md: 'markdown',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
};

/** Один загрузчик на всю страницу: темы и грамматики грузятся по разу. */
const shared: { promise: Promise<HighlighterCore> | undefined } = { promise: undefined };

const highlighterOf = (): Promise<HighlighterCore> => {
  const known = shared.promise;
  if (known !== undefined) return known;
  const started = createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  shared.promise = started;
  return started;
};

/** Язык по написанию в фенсед-блоке. Незнакомое написание — `null`, без подсветки. */
const languageOf = (value: string): Language | 'ansi' | null => {
  const name = value.toLowerCase();
  if (name === 'ansi') return 'ansi';
  if (name in languages) return name as Language;
  const alias = aliases[name];
  if (alias === undefined) return null;
  return alias;
};

/** Строка кода разметкой: по одному узлу на токен, цвета обоих тем сразу. */
const lineOf = (line: readonly ThemedToken[]): readonly React.ReactNode[] =>
  line.map((token) => (
    <span
      key={token.offset}
      style={token.htmlStyle as React.CSSProperties}
      className="text-(--shiki-light) dark:text-(--shiki-dark)"
    >
      {token.content}
    </span>
  ));

/** Подсветка кода: строка на строку, каждая строка — готовая разметка. */
export type CodeHighlighter = {
  readonly highlight: (
    code: string,
    state?: GrammarState,
  ) => {
    readonly lines: readonly (readonly React.ReactNode[])[];
    /** Состояние грамматики после последней строки. Пусто — продолжать нечего. */
    readonly state: GrammarState | undefined;
  };
};

/**
 * Загрузчик для языка: `null` — язык не подсвечиваем, блок покажет простой текст.
 * Грамматика грузится один раз и живёт в общем загрузчике страницы.
 */
export const loadHighlighter = async (language: string): Promise<CodeHighlighter | null> => {
  const lang = languageOf(language);
  if (lang === null) return null;
  const shiki = await highlighterOf();
  if (lang !== 'ansi' && !shiki.getLoadedLanguages().includes(lang)) {
    await shiki.loadLanguage(languages[lang]);
  }

  const tokenize = (text: string, state?: GrammarState): ThemedToken[][] =>
    shiki.codeToTokens(text, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      grammarState: state,
    }).tokens;

  return {
    // Строки и состояние грамматики после последней строки: то же состояние
    // продолжает подсветку, когда код дописывают по кускам.
    highlight: (code, state) => {
      // У ANSI нет состояния грамматики: каждая строка подсвечивается сама,
      // поэтому цвета одинаковы и в целом куске, и в потоке.
      if (lang === 'ansi') {
        const rows = code.split('\n').flatMap((row) => tokenize(row, state));
        return { lines: rows.map(lineOf), state: shiki.getLastGrammarState(rows) };
      }
      const rows = tokenize(code, state);
      return { lines: rows.map(lineOf), state: shiki.getLastGrammarState(rows) };
    },
  };
};
