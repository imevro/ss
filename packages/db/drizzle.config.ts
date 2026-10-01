import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const here = dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (url === undefined) throw new Error('DATABASE_URL не задан')

// Пути абсолютные: команду можно запускать из любого каталога.
export default defineConfig({
  dialect: 'postgresql',
  schema: join(here, 'src/schema/index.ts'),
  out: join(here, 'drizzle'),
  dbCredentials: { url },
  casing: 'snake_case',
})
