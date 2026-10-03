/**
 * Журнал чата на странице: один список записей на чат, в хранилище браузера.
 *
 * Состояние ленты не хранится — оно выводится переигрыванием журнала. Поэтому
 * восстановленный чат не отличается от свежего: тот же проход, те же события.
 * Готовые реплики с сервера кладутся в начало, их переигрывать нечего.
 */
import type { ChatEvent, LogEntry } from '@workspace/types';
import { logKey, logOfStored } from '@workspace/types';
import { useCallback, useEffect, useState } from 'react';

import type { StoredRow } from '@/lib/chat-state';
import { appendEntry, nowIso, stateOf } from '@/lib/chat-state';

/** Чтение журнала: хранилище может быть недоступно — тогда журнал пуст. */
const readLog = (conversationId: string | undefined): readonly LogEntry[] => {
  if (conversationId === undefined) return [];
  if (typeof globalThis.localStorage === 'undefined') return [];
  return logOfStored(globalThis.localStorage.getItem(logKey(conversationId)));
};

/** Запись журнала: места нет — журнал живёт до перезагрузки, лента не ломается. */
const writeLog = (conversationId: string | undefined, entries: readonly LogEntry[]): void => {
  if (conversationId === undefined) return;
  if (typeof globalThis.localStorage === 'undefined') return;
  try {
    globalThis.localStorage.setItem(logKey(conversationId), JSON.stringify(entries));
  } catch {
    // Место кончилось или хранилище запрещено: лента и так собрана в памяти.
  }
};

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
  const [entries, setEntries] = useState<readonly LogEntry[]>(() => readLog(conversationId));

  // Открыли другой чат — читаем его журнал, чужой не тянем за собой.
  useEffect(() => {
    setEntries(readLog(conversationId));
  }, [conversationId]);

  /** Событие в журнал: список растёт одним движением, состояние выводится из него. */
  const append = useCallback(
    (event: ChatEvent): void => {
      setEntries((current) => {
        const grown = appendEntry(current, event, nowIso());
        writeLog(conversationId, grown);
        return grown;
      });
    },
    [conversationId],
  );

  return { state: stateOf(messages, entries), append };
};
