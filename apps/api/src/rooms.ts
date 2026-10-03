/**
 * Комнаты живого потока. Комната — это набор открытых соединений под одним ключом:
 * человек открыл страницу — соединение в комнате, закрыл — комната пуста.
 *
 * Здесь нет разбора сообщений и правил: комната только передаёт то, что ей сказали.
 */

import type { ServerWebSocket } from 'bun';

import type { ClientEvent, conversationRoom, onboardingRoom } from '@workspace/types';

export type { ClientEvent };
export type { conversationRoom, onboardingRoom };

type Socket = ServerWebSocket<{ readonly room: string }>;

/** Комнаты процесса. Изменяемая карта — это реестр соединений, а не состояние игры. */
const rooms = new Map<string, Set<Socket>>();

export const joinRoom = (room: string, socket: Socket): void => {
  const members = rooms.get(room);
  if (members === undefined) {
    rooms.set(room, new Set([socket]));
    return;
  }
  members.add(socket);
};

export const leaveRoom = (room: string, socket: Socket): void => {
  const members = rooms.get(room);
  if (members === undefined) return;
  members.delete(socket);
  if (members.size === 0) rooms.delete(room);
};

/** Сказать комнате. Пустой комнаты может уже не быть — это не беда. */
export const say = (room: string, event: ClientEvent): void => {
  const members = rooms.get(room);
  if (members === undefined) return;
  const payload = JSON.stringify(event);
  for (const socket of members) socket.send(payload);
};
