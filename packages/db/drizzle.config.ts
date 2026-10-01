import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const here = dirname(fileURLToPath(import.meta.url))

/** Читаем .env сами: команда должна работать без флагов bun. */
const envFile = join(here, '../../.env')
const fromFile: Record<string, string> = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const at = line.indexOf('=')
          return [line.slice(0, at), line.slice(at + 1)]
        }),
    )
  : {}

const url = process.env.DATABASE_URL ?? fromFile.DATABASE_URL
if (url === undefined || url === '') throw new Error('DATABASE_URL не задан: заполни .env')

// Пути относительные: drizzle-kit не принимает абсолютные. Запускать из packages/db.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  casing: 'snake_case',
})
