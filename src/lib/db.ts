import type { ExtractTablesWithRelations, SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { getEnv } from './env';

export type Schema = typeof schema;

/** A Drizzle database on either driver: postgres.js (servers, CI) or PGlite (unit tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Db | Tx;

/**
 * A postgres.js database on `url`. `prepare: false` because Supabase's transaction-mode
 * pooler cannot keep named prepared statements across transactions.
 */
export function createDb(url: string): Db {
  const client = postgres(url, {
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db = drizzle({ client, schema });

  // Drizzle replaces postgres.js's serializers for the date and time types with identity
  // functions, so a raw `sql` template with a Date parameter fails on postgres.js (while it
  // works on PGlite). Send Dates as ISO strings; strings pass through unchanged.
  const toWire = (value: unknown) => (value instanceof Date ? value.toISOString() : value);
  for (const oid of [1082, 1083, 1114, 1184, 1266]) client.options.serializers[oid] = toWire;

  return db;
}

// Kept on globalThis so Next.js hot reloads in dev reuse one pool.
const holder = globalThis as typeof globalThis & { __eeDb?: Db };

/** The app's database, on `DATABASE_URL`. Created on first use. Server only. */
export function getDb(): Db {
  holder.__eeDb ??= createDb(getEnv().DATABASE_URL);
  return holder.__eeDb;
}

/** Closes the pool `getDb()` opened, so scripts can exit. */
export async function closeDb(): Promise<void> {
  const db = holder.__eeDb;
  holder.__eeDb = undefined;
  if (db) await closeClient(db);
}

/** Ends the underlying client of any Db (postgres.js pool or PGlite instance). */
export async function closeClient(db: Db): Promise<void> {
  const client = '$client' in db ? db.$client : undefined;
  if (typeof client === 'function' && 'end' in client && typeof client.end === 'function') {
    await (client.end as () => Promise<void>)();
  } else if (
    typeof client === 'object' &&
    client !== null &&
    'close' in client &&
    typeof client.close === 'function'
  ) {
    await (client.close as () => Promise<void>)();
  }
}

export function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

/**
 * Runs raw SQL and returns its rows on either driver. (`db.execute` returns an array-like
 * RowList on postgres.js but `{ rows }` on PGlite.) Prefer Drizzle's query builder; use this
 * for SQL the builder can't express.
 *
 * Both drivers return timestamps and dates as Postgres text ('2026-01-01 00:00:00+00'), but
 * int8 differs (a string on postgres.js, a number on PGlite), so cast counts: `count(*)::int`.
 */
export async function queryRows<T = Record<string, unknown>>(db: DbOrTx, query: SQL): Promise<T[]> {
  const result: unknown = await db.execute(query);
  if (Array.isArray(result)) return [...result] as T[];
  if (
    typeof result === 'object' &&
    result !== null &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as T[];
  }
  throw new Error('queryRows: unexpected result shape from db.execute');
}
