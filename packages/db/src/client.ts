/**
 * Один верхний клиент на процесс. Никаких фабрик и createDb().
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

const url = process.env.DATABASE_URL
if (url === undefined) throw new Error('DATABASE_URL не задан')

export const sql = postgres(url, { prepare: false, max: 10 })
export const db = drizzle(sql, { schema, casing: 'snake_case' })

export type Db = typeof db
export { schema }
