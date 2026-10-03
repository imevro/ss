/**
 * Контракт очереди: имена задач и то, что каждая получает на вход.
 * Одно место, где виден весь список работ.
 */

/** Входящее сообщение в том виде, в каком оно ложится в чат компании. */
export type IncomingMessage = {
  readonly externalId: string;
  readonly conversationId: string;
  readonly conversationTitle: string;
  readonly source: 'telegram';
  readonly role: 'user';
  readonly authorName: string | null;
  readonly text: string;
  /** Время отправки, ISO. Часовой пояс не теряем: телеграм отдаёт секунды UTC. */
  readonly sentAt: string;
};

export type Jobs = {
  'onboarding:proposal': { readonly userId: string; readonly business: string };
  'db:provision': { readonly companyId: string };
  'msg:ingest': { readonly companyId: string; readonly messages: readonly IncomingMessage[] };
};

export type JobName = keyof Jobs;
