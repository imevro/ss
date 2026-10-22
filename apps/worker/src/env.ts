/**
 * Настройки воркера. Читаются один раз при запуске.
 */

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`настройка ${name} не задана`);
  return value;
};

const optional = (name: string, fallback: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
};

export const config = {
  databaseUrl: required('DATABASE_URL'),
  brokerHost: optional('BUNQUEUE_HOST', '127.0.0.1'),
  brokerPort: Number(optional('BUNQUEUE_PORT', '6789')),
} as const;
