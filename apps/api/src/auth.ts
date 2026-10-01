/**
 * Вход. better-auth на drizzle; apple включается, когда заданы ключи.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@workspace/db'
import * as schema from '@workspace/db/schema'

const appleClientId = process.env.APPLE_CLIENT_ID
const appleClientSecret = process.env.APPLE_CLIENT_SECRET

const socialProviders =
  appleClientId === undefined || appleClientSecret === undefined
    ? {}
    : {
        apple: {
          clientId: appleClientId,
          clientSecret: appleClientSecret,
          appBundleIdentifier: process.env.APPLE_BUNDLE_ID,
        },
      }

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:8787',
  trustedOrigins: (process.env.WEB_ORIGINS ?? 'http://localhost:5173').split(','),
  emailAndPassword: { enabled: true },
  socialProviders,
})
