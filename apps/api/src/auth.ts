/**
 * Вход. better-auth на drizzle; apple включается, когда заданы оба ключа.
 */
import { account, db, newId, session, user, verification } from '@workspace/db';
import { createLogger } from '@workspace/log';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { config } from './env';

const log = createLogger('auth');

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
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  secret: config.authSecret,
  baseURL: config.authUrl,
  trustedOrigins: config.webOrigins,
  emailAndPassword: { enabled: true },
  socialProviders,
  // Свои строки — наши идентификаторы: форма одна на весь продукт.
  advanced: { database: { generateId: () => newId('user') } },
});
