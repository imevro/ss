/** Комната живого потока: страница подписывается и получает события, пока открыта. */
import type { ClientEvent, ToolCall } from '@workspace/types';
import { useEffect, useRef } from 'react';

/** Событие из комнаты. Свой вид — ещё не всё: поля тоже проверяются. */
const eventOf = (raw: string): ClientEvent | undefined => {
  const parsed = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null) return;
  const frame = parsed as Record<string, unknown>;
  const kind = frame.kind;
  if (typeof kind !== 'string') return;
  if (kind === 'problem') {
    if (typeof frame.reason !== 'string') return;
    return { kind, reason: frame.reason };
  }
  if (typeof frame.conversationId !== 'string') return;
  return READERS[kind]?.(frame, frame.conversationId);
};

/**
 * Чтение кадра по видам: у каждого вида свои поля. Номер записи в конце хода идёт
 * дальше как есть — по нему лента вытесняет собранную реплику.
 */
const READERS: Readonly<Record<string, (frame: Record<string, unknown>, room: string) => ClientEvent | undefined>> = {
  started: (frame, room) => {
    if (typeof frame.messageId !== 'string') return { kind: 'started', conversationId: room };
    return { kind: 'started', conversationId: room, messageId: frame.messageId };
  },
  thought: (_frame, room) => ({ kind: 'thought', conversationId: room }),
  chunk: (frame, room) => {
    if (typeof frame.text !== 'string') return;
    return { kind: 'chunk', conversationId: room, text: frame.text };
  },
  titled: (frame, room) => {
    if (typeof frame.title !== 'string') return;
    return { kind: 'titled', conversationId: room, title: frame.title };
  },
  done: (frame, room) => {
    if (typeof frame.messageId !== 'string') return { kind: 'done', conversationId: room };
    return { kind: 'done', conversationId: room, messageId: frame.messageId };
  },
  failed: (frame, room) => {
    if (typeof frame.reason !== 'string') return;
    return { kind: 'failed', conversationId: room, reason: frame.reason };
  },
  live: (frame, room) => {
    if (!Array.isArray(frame.calls)) return;
    return { kind: 'live', conversationId: room, calls: callsOf(frame.calls), thinking: frame.thinking === true };
  },
};

/** Список вызовов из кадра: испорченный вызов пропускается, целые берутся. */
const callsOf = (value: readonly unknown[]): readonly ToolCall[] =>
  value.flatMap((call) => {
    if (typeof call !== 'object' || call === null) return [];
    const named = call as Record<string, unknown>;
    if (typeof named.name !== 'string' || typeof named.intent !== 'string') return [];
    return [{ name: named.name, intent: named.intent }];
  });

/** Разбор кадра: мусор не должен ломать страницу. */
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Адрес комнаты: тот же хост, что и страница. Вход и разговор идут одним путём. */
const roomUrl = (room: string): string => {
  if (globalThis.location.protocol === 'https:') {
    return `wss://${globalThis.location.host}/v1/rooms/${encodeURIComponent(room)}`;
  }
  return `ws://${globalThis.location.host}/v1/rooms/${encodeURIComponent(room)}`;
};

/** Сколько ждём до следующего захода в комнату: с каждой неудачей вдвое дольше, но не больше минуты. */
const RETRY_MS = 2000;
const RETRY_MAX_MS = 60_000;

const retryDelay = (attempt: number): number => Math.min(RETRY_MS * 2 ** attempt, RETRY_MAX_MS);

/**
 * Подписка на комнату. Разбор события — на стороне страницы: комната передаёт
 * то, что ей сказали, и ничего не решает.
 *
 * Комната закрывается сама: сеть, сон машины, перезапуск API. Страница возвращается
 * в неё сама — иначе она нема до перезагрузки, а кадры потока терять нельзя.
 */
export const useLiveRoom = (room: string | null, onEvent: (event: ClientEvent) => void): void => {
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (room === null || room === '') return;
    const url = roomUrl(room);
    /** Соединение и ждущий повтор: их закрывает уборка эффекта. */
    const holder: { socket: WebSocket | undefined; timer: ReturnType<typeof setTimeout> | undefined; done: boolean } = {
      socket: undefined,
      timer: undefined,
      done: false,
    };

    const open = (attempt: number): void => {
      const socket = new WebSocket(url);
      holder.socket = socket;
      socket.addEventListener('message', (message: MessageEvent<string>) => {
        const event = eventOf(message.data);
        if (event === undefined) return;
        handler.current(event);
      });
      socket.addEventListener('close', () => {
        if (holder.done) return;
        holder.timer = setTimeout(() => open(attempt + 1), retryDelay(attempt));
      });
    };

    // Соединение открываем сразу: оно дёшево, а пропущенный первый кадр — нет.
    open(0);
    return () => {
      holder.done = true;
      clearTimeout(holder.timer);
      holder.socket?.close();
    };
  }, [room]);
};
