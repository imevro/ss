'use client';

import * as React from 'react';

import { mergeRefs } from '@workspace/ui/lib/merge-refs';
import { cn } from '@workspace/ui/lib/utils';
import { Textarea } from '@workspace/ui/components/textarea';
import { ScrollArea } from '@workspace/ui/components/scroll-area';

type PromptInputContextValue = {
  setTextareaNode: (node: HTMLTextAreaElement | null) => void;
  onSubmit?: (value: string) => void;
};

const PromptInputContext = React.createContext<PromptInputContextValue | null>(null);

type PromptInputProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSubmit'> & {
  /**
   * Called when Enter is pressed in the textarea (without Shift). Use with
   * value/onChange on PromptInputTextarea for controlled mode. Shift+Enter
   * inserts a new line.
   */
  onSubmit?: (value: string) => void;
};

function PromptInput({
  className,
  role: _role,
  'aria-label': _ariaLabel,
  onClick,
  onSubmit,
  ...props
}: PromptInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.closest('button, a, input, textarea, [role="button"], [role="tab"]')) {
        textareaRef.current?.focus();
      }
      onClick?.(e);
    },
    [onClick],
  );

  const contextValue = React.useMemo<PromptInputContextValue>(
    () => ({
      setTextareaNode: (node) => {
        textareaRef.current = node;
      },
      onSubmit,
    }),
    [onSubmit],
  );

  return (
    <PromptInputContext.Provider value={contextValue}>
      <div
        role="group"
        aria-label="Поле ввода"
        className={cn(
          'relative flex h-auto w-full cursor-text flex-col gap-0 overflow-hidden rounded-3xl border border-border bg-card dark:border-border/50 dark:bg-input/30',
          className,
        )}
        onClick={handleClick}
        {...props}
      />
    </PromptInputContext.Provider>
  );
}

type PromptInputTextareaProps = React.ComponentProps<typeof Textarea>;

const PromptInputTextarea = React.forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  function PromptInputTextarea({ className, 'aria-label': _ariaLabel, onKeyDown, ...props }, ref) {
    const context = React.useContext(PromptInputContext);
    const setTextareaNode = context?.setTextareaNode;
    const onSubmit = context?.onSubmit;
    const handleTextareaRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        mergeRefs<HTMLTextAreaElement>(setTextareaNode, ref)(node);
      },
      [setTextareaNode, ref],
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
          e.preventDefault();
          onSubmit(e.currentTarget.value);
        }
        onKeyDown?.(e);
      },
      [onSubmit, onKeyDown],
    );

    return (
      <ScrollArea className="max-h-40">
        <Textarea
          ref={handleTextareaRef}
          className={cn(
            'min-h-14 w-full resize-none border-0 bg-transparent px-4 py-4 leading-6 font-normal text-primary shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent',
            className,
          )}
          onKeyDown={handleKeyDown}
          {...props}
        />
      </ScrollArea>
    );
  },
);

type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>;

function PromptInputActions({ className, role: _role, 'aria-label': _ariaLabel, ...props }: PromptInputActionsProps) {
  return (
    <div
      role="group"
      aria-label="Input actions"
      className={cn('flex w-full shrink-0 items-center justify-between px-2 py-2', className)}
      {...props}
    />
  );
}

type PromptInputActionGroupProps = React.HTMLAttributes<HTMLDivElement>;

function PromptInputActionGroup({ className, ...props }: PromptInputActionGroupProps) {
  return <div className={cn('flex gap-2', className)} {...props} />;
}

type PromptInputActionProps = React.HTMLAttributes<HTMLDivElement>;

/** Место для кнопки рядом с полем ввода. Подсказок нет: они не нужны. */
function PromptInputAction({ className, ...props }: PromptInputActionProps) {
  return <div className={cn('flex items-center', className)} {...props} />;
}

export { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputActionGroup, PromptInputAction };
