/**
 * Вход. better-auth на drizzle; apple включается, когда заданы оба ключа.
 * Ключи компаний ведёт плагин api-key: ключ принадлежит человеку, а компания
 * лежит в метаданных ключа — владелец не подделывается клиентом.
 */
import { apiKey } from '@better-auth/api-key';
import type { IdKind } from '@workspace/db';
import {
  account,
  apiKeys,
  db,
  invitation,
  member,
  newId,
  organization,
  session,
  user,
  verification,
} from '@workspace/db';
import { createLogger } from '@workspace/log';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization as organizationPlugin } from 'better-auth/plugins/organization';

import { config } from './env';

const log = createLogger('auth');

/**
 * Имя таблицы входа → вид нашего номера. Неизвестная таблица — отказ: иначе в
 * базе молча появится номер с чужим началом и его не отличить в журнале.
 */
const MODEL_ID_KIND: Record<string, IdKind> = {
  user: 'user',
  session: 'session',
  account: 'account',
  verification: 'verification',
  apikey: 'apiKey',
  organization: 'organization',
  member: 'member',
  invitation: 'invitation',
};

const idFor = (model: string): string => {
  const kind = MODEL_ID_KIND[model];
  if (kind === undefined) throw new Error(`нет вида номера для таблицы ${model}`);
  return newId(kind);
};

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  if (value === undefined || value === '') return;
  return value;
};

const appleClientId = env('APPLE_CLIENT_ID');
const appleClientSecret = env('APPLE_CLIENT_SECRET');

const appleReady = appleClientId !== undefined && appleClientSecret !== undefined;

type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]['socialProviders']>;

const socialProvidersOf = (): SocialProviders => {
  if (!appleReady) return {};
  return {
    apple: {
      clientId: appleClientId,
      clientSecret: appleClientSecret,
      appBundleIdentifier: env('APPLE_BUNDLE_ID'),
    },
  };
};

const socialProviders = socialProvidersOf();

if (!appleReady) log.info('apple выключен: нет ключей');

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Имена ключей — имена таблиц плагина: по ним он ищет свою схему в этом объекте.
    schema: { user, session, account, verification, apikey: apiKeys, organization, member, invitation },
  }),
  secret: config.authSecret,
  baseURL: config.authUrl,
  trustedOrigins: config.webOrigins,
  emailAndPassword: { enabled: true },
  socialProviders,
  // Ключи доступа к Cloudflare: строка ключа с нашим началом, метаданные с компанией.
  // Ограничение частоты выключено: у плагина по умолчанию 10 запросов в сутки — это
  // остановило бы кланкера на второй минуте работы.
  plugins: [
    apiKey({ enableMetadata: true, defaultPrefix: 'ss_cf_', rateLimit: { enabled: false } }),
    // Компании, членства и приглашения ведёт плагин. Подтверждение адреса для
    // приглашения выключено: вход у нас без писем, подтверждать нечего.
    organizationPlugin({ requireEmailVerificationOnInvitation: false, invitationExpiresIn: 14 * 24 * 3600 }),
  ],
  // Свои строки — наши идентификаторы: форма одна на весь продукт, вид — по таблице.
  advanced: { database: { generateId: ({ model }) => idFor(model) } },
});
