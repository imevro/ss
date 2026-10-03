import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'drizzle-kit';

const here = dirname(fileURLToPath(import.meta.url));

/** Читаем .env сами: команда должна работать без флагов bun. */
const envFile = join(here, '../../.env');

const parseEnv = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );

const readEnvFile = (): Record<string, string> => {
  if (!existsSync(envFile)) return {};
  return parseEnv(readFileSync(envFile, 'utf8'));
};

const fromFile = readEnvFile();

/** Значение берём из среды; нет — из файла. Пустое значение и там, и там — отказ. */
const urlOf = (fromEnv: string | undefined, fromDisk: string | undefined): string => {
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  if (fromDisk !== undefined && fromDisk !== '') return fromDisk;
  throw new Error('DATABASE_URL не задан: заполни .env');
};

const url = urlOf(process.env.DATABASE_URL, fromFile.DATABASE_URL);

// Схемы разложены по доменам; drizzle собирает их списком.
// Пути относительные: drizzle-kit не принимает абсолютные. Запускать из packages/postgres.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/auth.ts', './src/companies.ts', './src/onboarding.ts', '../log/src/schema.ts'],
  out: './drizzle',
  dbCredentials: { url },
});
