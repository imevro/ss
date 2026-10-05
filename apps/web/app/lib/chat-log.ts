/**
 * Журнал чата на странице: один список записей на чат, только в памяти.
 *
 * Состояние ленты не хранится — оно выводится переигрыванием журнала. Хранилища
 * браузера здесь нет: правда одна, она в базе. Страница помнит только то, что
 * успело прийти по сокету за её жизнь. После перезагрузки лента приходит из базы,
 * и ход, который идёт сейчас, — оттуда же: его запись заводится с началом хода.
 */
import type { ChatEvent, LogEntry } from '@workspace/types';
import { useCallback, useState } from 'react';

import type { StoredRow } from '@/lib/chat-state';
import { appendEntry, nowIso, stateOf } from '@/lib/chat-state';

/**
 * Состояние чата и запись событий. Событие ложится в журнал, состояние выводится
 * из журнала одним проходом: второго пути сборки ленты нет.
 */
export const useChatLog = (
  conversationId: string | undefined,
  messages: readonly StoredRow[],
): {
  readonly state: ReturnType<typeof stateOf>;
  readonly append: (event: ChatEvent) => void;
} => {
  /** Журнал помнит, к какому чату он относится: чужой чат начинает его заново. */
  const [log, setLog] = useState<{ readonly chat: string | undefined; readonly entries: readonly LogEntry[] }>({
    chat: conversationId,
    entries: [],
  });
  if (log.chat !== conversationId) setLog({ chat: conversationId, entries: [] });

  /** Событие в журнал: список растёт одним движением, состояние выводится из него. */
  const append = useCallback((event: ChatEvent): void => {
    setLog((current) => ({ ...current, entries: appendEntry(current.entries, event, nowIso()) }));
  }, []);

  return { state: stateOf(messages, log.entries), append };
};
