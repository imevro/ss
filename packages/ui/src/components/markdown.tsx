'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { Streamdown } from 'streamdown';
import { useHighlightedCode } from '@workspace/ui/hooks/use-highlighted-code';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from '@workspace/ui/components/code-block';
import { cn } from '@workspace/ui/lib/utils';

const streamdownPlugins = { cjk, code, math, mermaid } as const;

const proseClasses = [
  'prose max-w-none text-primary font-normal text-base leading-7',
  // headings
  'prose-headings:font-[450] prose-headings:leading-5.5 prose-h2:tracking-[-0.45px] prose-headings:mb-4 prose-headings:mt-6 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h3:leading-4.5 prose-h3:tracking-[-0.4px] prose-h4:text-sm prose-h5:text-xs prose-h6:text-xs',
  // heading links
  'prose-headings:[&_a]:no-underline prose-headings:[&_a]:shadow-none prose-headings:[&_a]:text-inherit',
  // body text
  'prose-p:mb-2 prose-p:mt-5',
  // lead
  'prose-lead:text-primary',
  // links
  '[&_[data-streamdown=link]]:text-foreground [&_[data-streamdown=link]]:font-normal [&_[data-streamdown=link]]:underline [&_[data-streamdown=link]]:underline-offset-2',
  // strong
  '[&_[data-streamdown=strong]]:text-foreground [&_[data-streamdown=strong]]:font-[550]',
  // lists
  'prose-li:my-[-0.5px] prose-li:marker:text-muted-foreground/50 prose-ul:my-0 prose-ol:my-0 prose-ol:pl-3',
] as const;

/** Язык фенсед-блока: из класса `<code>`, а если его нет — из метастроки узла. */
const languageOf = (className: string | undefined, metastring: unknown): string => {
  const fromClass = /language-([^\s]+)/.exec(className ?? '');
  if (fromClass?.[1] !== undefined) return fromClass[1];
  if (typeof metastring === 'string') return metastring;
  return '';
};

/** Код из детей фенсед-блока: строка или обёрнутый `<code>`. */
const codeOf = (children: unknown): string => {
  if (typeof children === 'string') return children;
  if (!isElementLike(children)) return '';
  const inner: unknown = children.props.children;
  if (typeof inner === 'string') return inner;
  return '';
};

/** Узел React с пропами: только такой узел может нести текст в `<code>`. */
const isElementLike = (value: unknown): value is { readonly props: { readonly children?: unknown } } => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('props' in value)) return false;
  return typeof value.props === 'object' && value.props !== null;
};

/**
 * Фенсед-блок: подсветка, номер строк и копирование. Строки приходят из хука готовой
 * разметкой; на сервере он отдаёт простой текст, поэтому первая отрисовка серверная,
 * а подсветка появляется после оживления.
 */
const FencedCode = ({ language, code }: { readonly language: string; readonly code: string }) => {
  const lines = useHighlightedCode(code, language);
  // `not-prose` снимает с блока кода стили prose: иначе `pre` красится в тёмное
  // и теряет свои отступы.
  return (
    <CodeBlock className="not-prose">
      <CodeBlockHeader>
        <CodeBlockTitle>{language}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={code} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent lineNumbers>
        {lines.map((line, index) => (
          // Номер строки и есть её ключ: строки кода неизменны, порядок задан текстом.
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
};

/** Строка кода внутри текста: своя плашка, чтобы не путалась с фенсед-блоком. */
const InlineCode = (props: React.HTMLAttributes<HTMLElement>) => (
  <code
    data-slot="markdown-inline-code"
    className="rounded-md border-none bg-muted px-1.5 py-0.5 font-mono text-xs font-[450]"
    {...props}
  />
);

/** Таблица ответа: обёртка держит скругления, сама таблица — только сетку. */
const Table = (props: React.HTMLAttributes<HTMLTableElement>) => (
  <div
    data-slot="markdown-table-wrap"
    className={[
      'prose-no-margin my-6 overflow-hidden rounded-2xl border border-border bg-muted dark:border-accent dark:bg-background',
      '[&_tbody_tr:first-child_td:first-child]:rounded-ss-xl',
      '[&_tbody_tr:first-child_td:last-child]:rounded-se-xl',
      '[&_tbody_tr:last-child_td:first-child]:rounded-es-xl',
      '[&_tbody_tr:last-child_td:last-child]:rounded-ee-xl',
    ].join(' ')}
  >
    <table
      data-slot="markdown-table"
      className="w-full border-separate border-spacing-0 border-none bg-muted text-sm dark:bg-background"
      {...props}
    />
  </div>
);

const HeadCell = (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    data-slot="markdown-th"
    className="border-none px-5 py-2 text-start text-[13px] font-normal! text-muted-foreground! dark:bg-background"
    {...props}
  />
);

const Cell = (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td
    data-slot="markdown-td"
    className="border-0 border-accent bg-card px-5 py-3 text-[13px] text-primary dark:bg-card [tr:not(:first-child)_&]:border-t"
    {...props}
  />
);

/** Узел разметки, который несёт метастроку: язык блока берём ещё и оттуда. */
type CodeNode = { readonly properties?: { readonly metastring?: unknown } };

/** Компоненты разметки: фенсед-блок — Code Block, остальное — prose. */
const markdownComponents = {
  code: ({ children, className, node }: React.ComponentProps<'code'> & { readonly node?: CodeNode | undefined }) => (
    <FencedCode code={codeOf(children)} language={languageOf(className, node?.properties?.metastring)} />
  ),
  inlineCode: InlineCode,
  table: Table,
  th: HeadCell,
  td: Cell,
};

/**
 * Разметка ответа агента. Одно место, где Streamdown срастается с Code Block:
 * остальное — тот же prose, что и раньше.
 */
export function Markdown({ className, components, ...props }: React.ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      data-slot="markdown"
      className={cn(...proseClasses, '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      components={{ ...markdownComponents, ...components } as React.ComponentProps<typeof Streamdown>['components']}
      shikiTheme={['github-light', 'github-dark']}
      plugins={streamdownPlugins}
      {...props}
    />
  );
}
