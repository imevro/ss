import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL
if (url === undefined) throw new Error('DATABASE_URL не задан')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  casing: 'snake_case',
})
