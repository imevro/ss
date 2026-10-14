/**
 * Комнаты живого потока. Комната — это набор открытых соединений под одним ключом:
 * человек открыл страницу — соединение в комнате, закрыл — комната пуста.
 *
 * Здесь нет разбора сообщений и правил: комната только передаёт то, что ей сказали.
 */

import type { ServerWebSocket } from 'bun';

import type { ClientEvent } from '@workspace/types';

export type Socket = ServerWebSocket<{ readonly room: string }>;

/** Соединение hono приходит непрозрачным: вид его знает только комната. */
export const asSocket = (raw: unknown): Socket => raw as Socket;

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
