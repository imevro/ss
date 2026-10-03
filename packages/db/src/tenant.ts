/**
 * Клиент базы компании. Учётные данные берутся из реестра: у каждой компании своя
 * база и своя роль. Соединения держим по имени базы — воркер обрабатывает несколько
 * компаний в одном процессе.
 */
import { companyDatabases, db } from '@workspace/db';
import { eq } from 'drizzle-orm';
import type { Sql } from 'postgres';
import postgres from 'postgres';

const pools = new Map<string, Sql>();

/** Соединение живёт до конца процесса: открывать новое на каждое сообщение — тратить время. */
const poolFor = (dbName: string, role: string, url: string): Sql => {
  const key = `${dbName}:${role}`;
  const existing = pools.get(key);
  if (existing !== undefined) return existing;
  const pool = postgres(url, { max: 4 });
  pools.set(key, pool);
  return pool;
};

const dbNameOf = async (companyId: string): Promise<string | undefined> => {
  const rows = await db
    .select({ dbName: companyDatabases.dbName })
    .from(companyDatabases)
    .where(eq(companyDatabases.companyId, companyId))
    .limit(1);
  return rows[0]?.dbName;
};

/**
 * Адрес базы компании выводится из адреса служебной базы: кластер один.
 * Учётные данные не заданы — значит входим нашей ролью: схема ctx наша,
 * компания её только читает.
 */
const urlFor = (
  coreUrl: string,
  dbName: string,
  credentials: { user: string; password: string } | undefined,
): string => {
  const url = new URL(coreUrl);
  url.pathname = `/${dbName}`;
  if (credentials !== undefined) {
    url.username = credentials.user;
    url.password = credentials.password;
  }
  return url.toString();
};

/** Наша роль в базе компании. Пишем только мы: схема контекста принадлежит платформе. */
export const platformSql = async (companyId: string): Promise<Sql | undefined> => {
  const coreUrl = process.env.DATABASE_URL;
  if (coreUrl === undefined || coreUrl === '') return;
  const dbName = await dbNameOf(companyId);
  if (dbName === undefined) return;
  return poolFor(dbName, 'platform', urlFor(coreUrl, dbName, undefined));
};
