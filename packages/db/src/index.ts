/**
 * Клиент базы и все таблицы. Один верхний клиент на процесс: никаких фабрик
 * и createDb(). Таблицы экспортируются рядом, чтобы владелец схемы был один.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export * from './auth';
export * from './companies';
export * from './ids';
export * from './onboarding';
export * from './tenant';

const url = process.env.DATABASE_URL;
if (url === undefined) throw new Error('DATABASE_URL не задан');

export const sql = postgres(url, { prepare: false, max: 10 });
export const db = drizzle(sql, { casing: 'snake_case' });

export type Db = typeof db;
