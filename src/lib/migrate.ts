import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import type { Sql } from 'postgres';
import type { Db } from './db';

/** `NNNN_<module>.sql`, for example `0100_identity.sql`. */
const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

/** Serializes concurrent migrators (two deploys at once). Transaction-scoped, so it is safe
 * behind Supabase's transaction-mode pooler. */
const LOCK_KEY = 727_271_001;

const BOOTSTRAP = `
create schema if not exists app;
create table if not exists app.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
`;

interface RawTx {
  /** Runs one or more statements with no parameters. */
  exec(sql: string): Promise<void>;
  query<T>(sql: string, params: string[]): Promise<T[]>;
}

interface RawRunner {
  transaction<T>(fn: (tx: RawTx) => Promise<T>): Promise<T>;
}

function isPglite(client: unknown): client is PGlite {
  return (
    typeof client === 'object' &&
    client !== null &&
    'exec' in client &&
    typeof client.exec === 'function' &&
    'transaction' in client &&
    typeof client.transaction === 'function'
  );
}

function isPostgresJs(client: unknown): client is Sql {
  return (
    typeof client === 'function' &&
    'begin' in client &&
    typeof client.begin === 'function' &&
    'unsafe' in client &&
    typeof client.unsafe === 'function'
  );
}

// Migration files hold several statements, which Drizzle's `execute` cannot send on PGlite
// (it uses the extended protocol). So the migrator talks to the driver's client directly.
function rawRunner(db: Db): RawRunner {
  const client: unknown = '$client' in db ? db.$client : undefined;

  if (isPglite(client)) {
    return {
      transaction: (fn) =>
        client.transaction((tx) =>
          fn({
            exec: async (sql) => {
              await tx.exec(sql);
            },
            query: async <T>(sql: string, params: string[]) =>
              (await tx.query<T>(sql, params)).rows,
          }),
        ),
    };
  }

  if (isPostgresJs(client)) {
    return {
      transaction: async <T>(fn: (tx: RawTx) => Promise<T>) => {
        const result = await client.begin((tx) =>
          fn({
            exec: async (sql) => {
              await tx.unsafe(sql).simple();
            },
            query: async <R>(sql: string, params: string[]) =>
              [...(await tx.unsafe(sql, params))] as R[],
          }),
        );
        return result as T;
      },
    };
  }

  throw new Error('runMigrations: unsupported database client');
}

/**
 * Applies every `*.sql` file in `dir` not yet recorded in `app.schema_migrations`, in name
 * order. Each file runs in its own transaction together with the insert that records it, so a
 * failing file leaves nothing behind. Returns the names of the files it applied.
 */
export async function runMigrations(db: Db, dir = 'drizzle'): Promise<string[]> {
  const runner = rawRunner(db);
  const absDir = path.resolve(dir);

  const files = (await readdir(absDir)).filter((f) => f.endsWith('.sql')).sort();
  const badNames = files.filter((f) => !FILE_NAME.test(f));
  if (badNames.length > 0) {
    throw new Error(`Migration file names must match NNNN_<name>.sql: ${badNames.join(', ')}`);
  }

  const lock = `select pg_advisory_xact_lock(${LOCK_KEY})`;

  const done = await runner.transaction(async (tx) => {
    await tx.exec(lock);
    await tx.exec(BOOTSTRAP);
    const rows = await tx.query<{ name: string }>('select name from app.schema_migrations', []);
    return new Set(rows.map((r) => r.name));
  });

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const content = await readFile(path.join(absDir, file), 'utf8');

    let ran: boolean;
    try {
      ran = await runner.transaction(async (tx) => {
        await tx.exec(lock);
        const already = await tx.query('select 1 from app.schema_migrations where name = $1', [
          file,
        ]);
        if (already.length > 0) return false;
        await tx.exec(content);
        await tx.query('insert into app.schema_migrations (name) values ($1)', [file]);
        return true;
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Migration ${file} failed: ${reason}`, { cause: err });
    }
    if (ran) applied.push(file);
  }
  return applied;
}
