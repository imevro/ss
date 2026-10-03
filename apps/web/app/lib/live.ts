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
  if (kind === 'proposal') return { kind, proposal: frame.proposal };
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
  started: (_frame, room) => ({ kind: 'started', conversationId: room }),
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

/**
 * Подписка на комнату. Разбор события — на стороне страницы: комната передаёт
 * то, что ей сказали, и ничего не решает.
 */
export const useLiveRoom = (room: string | null, onEvent: (event: ClientEvent) => void): void => {
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (room === null || room === '') return;
    // Соединение открываем сразу: оно дёшево, а пропущенный первый кадр — нет.
    const socket = new WebSocket(roomUrl(room));
    socket.addEventListener('message', (message: MessageEvent<string>) => {
      const event = eventOf(message.data);
      if (event === undefined) return;
      handler.current(event);
    });
    return () => socket.close();
  }, [room]);
};
