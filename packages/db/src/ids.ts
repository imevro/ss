/**
 * Идентификаторы. Все наши идентификаторы — nanoid с префиксом таблицы:
 * `comp_…`, `app_…`. Ни uuid, ни crypto.randomUUID здесь нет: форма одна на весь
 * продукт, и читается она в логе без похода в базу. Единственный генератор.
 */
import { customAlphabet } from 'nanoid';

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 20;

export type IdKind =
  | 'organization'
  | 'member'
  | 'invitation'
  | 'agentSession'
  | 'app'
  | 'user'
  | 'session'
  | 'account'
  | 'verification'
  | 'apiKey'
  | 'conversation'
  | 'message'
  | 'request'
  | 'onboarding';

const PREFIX: Record<IdKind, string> = {
  organization: 'comp',
  member: 'memb',
  invitation: 'inv',
  agentSession: 'asess',
  app: 'app',
  user: 'usr',
  session: 'sess',
  account: 'acct',
  verification: 'verif',
  apiKey: 'key',
  conversation: 'chat',
  message: 'msg',
  request: 'req',
  onboarding: 'onb',
};

const mint = customAlphabet(ID_ALPHABET);

/** Тело укорачивается под префикс: имя с префиксом и знаком не длиннее ID_LENGTH. */
const bodyLength = (prefix: string): number => ID_LENGTH - prefix.length - 1;

/** Идентификатор с префиксом: вид объекта виден до обращения к базе. */
export const newId = (kind: IdKind): string => {
  const prefix = PREFIX[kind];
  return `${prefix}_${mint(bodyLength(prefix))}`;
};
