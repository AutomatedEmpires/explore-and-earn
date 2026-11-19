// The backup manifest (SP8 spec 8.11): for every base table in schema `app`, its row count and
// newest `created_at`, plus the applied migrations. A backup stores the manifest beside its
// dump, and the restore drill compares it with the restored database, so a restore that lost
// rows fails loudly instead of looking fine.
//
// The dump and its manifest read ONE snapshot (Plan decision 35): takeConsistentBackup() opens a
// `repeatable read` transaction, exports its snapshot, builds the manifest inside it, and runs
// `pg_dump --snapshot=<id>` while that session stays open. Busy tables (outbox, rate limits,
// notifications) then match exactly. Never run pg_dump and the manifest as separate sessions.
//
// This file talks to the driver directly (no query builder): it reads every table by name and
// owns none of them.
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import type { Db } from '@/lib/db';

export type BackupManifest = {
  /**
   * ISO time of the restore point. For a backup it is read just before the snapshot begins, so
   * it is never later than the snapshot: everything committed before it is in the dump. The
   * deletion replay after a restore starts from here, less a margin.
   */
  takenAt: string;
  /** Applied migration file names, sorted. */
  migrations: string[];
  tables: Record<string, { rows: number; maxCreatedAt: string | null }>;
};

/** Runs one SQL statement (no parameters) and returns its rows. */
export type SqlRunner = (text: string) => Promise<Record<string, unknown>[]>;

type PgliteLike = { query(text: string): Promise<{ rows: Record<string, unknown>[] }> };
type PostgresJsLike = { unsafe(text: string): PromiseLike<Iterable<Record<string, unknown>>> };

function isPglite(client: unknown): client is PgliteLike {
  return (
    typeof client === 'object' &&
    client !== null &&
    'query' in client &&
    typeof client.query === 'function' &&
    'exec' in client
  );
}

function isPostgresJs(client: unknown): client is PostgresJsLike {
  return typeof client === 'function' && 'unsafe' in client && typeof client.unsafe === 'function';
}

function runnerFor(db: Db | SqlRunner): SqlRunner {
  if (typeof db === 'function') return db;
  const client: unknown = '$client' in db ? db.$client : undefined;
  if (isPglite(client)) return async (text) => (await client.query(text)).rows;
  if (isPostgresJs(client)) return async (text) => [...(await client.unsafe(text))];
  throw new Error('backup manifest: unsupported database client');
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Microsecond precision, so two reads of the same row always produce the same text. */
const ISO_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/**
 * The manifest of the database behind `db`, as one statement, so even outside a transaction
 * every count comes from the same snapshot.
 */
export async function buildBackupManifest(
  db: Db | SqlRunner,
  now: Date = new Date(),
): Promise<BackupManifest> {
  const run = runnerFor(db);

  const tableRows = await run(`
    select t.table_name as name,
      (select c.data_type from information_schema.columns c
       where c.table_schema = 'app' and c.table_name = t.table_name
         and c.column_name = 'created_at') as created_type
    from information_schema.tables t
    where t.table_schema = 'app' and t.table_type = 'BASE TABLE'
    order by t.table_name
  `);

  const tables: BackupManifest['tables'] = {};
  if (tableRows.length > 0) {
    const parts = tableRows.map((row) => {
      const name = String(row.name);
      const created = String(row.created_type ?? '');
      const max =
        created === 'timestamp with time zone'
          ? `to_char(max(created_at) at time zone 'UTC', ${ISO_FORMAT})`
          : created === 'timestamp without time zone'
            ? `to_char(max(created_at), ${ISO_FORMAT})`
            : 'null::text';
      return `select ${quoteLiteral(name)}::text as name, count(*)::text as row_count, ${max} as max_created_at from app.${quoteIdent(name)}`;
    });
    for (const row of await run(parts.join('\nunion all\n'))) {
      tables[String(row.name)] = {
        rows: Number(row.row_count),
        maxCreatedAt: row.max_created_at === null ? null : String(row.max_created_at),
      };
    }
  }

  const migrations = 'schema_migrations' in tables
    ? (await run('select name from app.schema_migrations order by name')).map((row) =>
        String(row.name),
      )
    : [];

  return { takenAt: now.toISOString(), migrations, tables };
}

/**
 * One line per difference between the manifest a backup was taken with and the database it was
 * restored into. An empty list means the restore holds exactly what the backup held.
 */
export function compareManifest(expected: BackupManifest, actual: BackupManifest): string[] {
  const lines: string[] = [];
  const names = new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)]);
  for (const name of [...names].sort()) {
    const want = expected.tables[name];
    const got = actual.tables[name];
    if (!want) {
      lines.push(`${name}: not in the manifest, found ${got?.rows ?? 0} rows`);
    } else if (!got) {
      lines.push(`${name}: expected ${want.rows} rows, found no table`);
    } else if (want.rows !== got.rows) {
      lines.push(`${name}: expected ${want.rows} rows, found ${got.rows}`);
    } else if (want.maxCreatedAt !== got.maxCreatedAt) {
      lines.push(
        `${name}: expected newest row ${want.maxCreatedAt ?? 'none'}, found ${got.maxCreatedAt ?? 'none'}`,
      );
    }
  }

  const applied = new Set(actual.migrations);
  const recorded = new Set(expected.migrations);
  const missing = expected.migrations.filter((name) => !applied.has(name));
  const extra = actual.migrations.filter((name) => !recorded.has(name));
  if (missing.length > 0) lines.push(`migrations: missing ${missing.join(', ')}`);
  if (extra.length > 0) lines.push(`migrations: not in the manifest ${extra.join(', ')}`);
  return lines;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The restore drill's check (spec 8.11): the restored database matches the manifest, and the
 * restore point is no older than `maxAgeHours`.
 */
export async function verifyRestore(
  db: Db | SqlRunner,
  expected: BackupManifest,
  o: { now?: Date; maxAgeHours?: number } = {},
): Promise<{ differences: string[]; restorePointAgeHours: number }> {
  const now = o.now ?? new Date();
  const maxAgeHours = o.maxAgeHours ?? 24;
  const takenAt = new Date(expected.takenAt);
  if (Number.isNaN(takenAt.getTime())) throw new Error('backup manifest: takenAt is not a date');

  const restorePointAgeHours = Math.round(((now.getTime() - takenAt.getTime()) / HOUR_MS) * 100) / 100;
  const differences = compareManifest(expected, await buildBackupManifest(db, now));
  if (restorePointAgeHours > maxAgeHours) {
    differences.push(
      `restore point: ${restorePointAgeHours} hours old, the limit is ${maxAgeHours}`,
    );
  }
  return { differences, restorePointAgeHours };
}

/** Parses a manifest file's content, refusing anything that is not a manifest. */
export function parseManifest(text: string): BackupManifest {
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('takenAt' in value) ||
    typeof value.takenAt !== 'string' ||
    !('migrations' in value) ||
    !Array.isArray(value.migrations) ||
    !('tables' in value) ||
    typeof value.tables !== 'object' ||
    value.tables === null
  ) {
    throw new Error('backup manifest: the file is not a manifest');
  }
  const tables: BackupManifest['tables'] = {};
  for (const [name, entry] of Object.entries(value.tables)) {
    const rows: unknown = entry?.rows;
    const max: unknown = entry?.maxCreatedAt;
    if (typeof rows !== 'number' || (max !== null && typeof max !== 'string')) {
      throw new Error(`backup manifest: bad entry for table ${name}`);
    }
    tables[name] = { rows, maxCreatedAt: max };
  }
  return { takenAt: value.takenAt, migrations: value.migrations.map(String), tables };
}

/** Runs pg_dump with `args`; the connection comes from `env` (PGHOST and friends). */
export type RunDump = (args: string[], env: Record<string, string>) => Promise<void>;

/**
 * libpq environment variables for a connection URL. The URL (and its password) is passed to
 * pg_dump this way and never as an argument, where the process list and CI logs could show it.
 */
export function pgEnvFromUrl(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('backup: the database URL must start with postgres:// or postgresql://');
  }
  const env: Record<string, string> = {
    PGHOST: decodeURIComponent(url.hostname),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

const STDERR_TAIL = 2000;

const spawnPgDump: RunDump = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn('pg_dump', args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL);
    });
    child.on('error', (err) => {
      reject(new Error(`pg_dump could not start: ${err.message}`, { cause: err }));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim()}`));
    });
  });

const SNAPSHOT_ID = /^[0-9A-Za-z-]+$/;

/** The open transaction a backup reads in: raw statements, no parameters. */
export type SnapshotTx = {
  unsafe(text: string): PromiseLike<Iterable<Record<string, unknown>>>;
};

/** The one connection a backup runs on: postgres.js in production, a fake in unit tests. */
export type BackupSession = {
  begin<T>(mode: string, fn: (tx: SnapshotTx) => Promise<T>): Promise<T>;
  end(o: { timeout: number }): Promise<void>;
};

function postgresSession(databaseUrl: string): BackupSession {
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return {
    begin: async <T>(mode: string, fn: (tx: SnapshotTx) => Promise<T>) =>
      (await client.begin(mode, (tx) => fn(tx))) as T,
    end: (o) => client.end(o),
  };
}

const SNAPSHOT_MODE = 'isolation level repeatable read read only';

/**
 * Takes a dump and its manifest from one snapshot.
 *
 * The manifest's `takenAt` is read from `clock` BEFORE the transaction begins, so it is never
 * later than the snapshot. An erasure that commits after the snapshot is missing from the dump,
 * and the deletion replay after a restore only reads ledger entries from takenAt (less its
 * margin), so a takenAt read after the snapshot could let such an erasure be undone.
 *
 * `databaseUrl` must keep its session open for the whole dump: Supabase's session pooler or a
 * direct connection, never the transaction pooler (an exported snapshot disappears with the
 * session that made it). Only schema `app` is dumped; it is the only schema the read-only
 * `backup_reader` role can read. A pg_dump failure rolls the transaction back and throws.
 */
export async function takeConsistentBackup(i: {
  databaseUrl: string;
  dumpPath: string;
  runDump?: RunDump;
  /** Defaults to the system clock. */
  clock?: () => Date;
  /** Defaults to one postgres.js connection on `databaseUrl`. */
  session?: BackupSession;
}): Promise<BackupManifest> {
  const runDump = i.runDump ?? spawnPgDump;
  const env = pgEnvFromUrl(i.databaseUrl);
  const takenAt = (i.clock ?? (() => new Date()))();
  const session = i.session ?? postgresSession(i.databaseUrl);
  try {
    return await session.begin(SNAPSHOT_MODE, async (tx) => {
      const [row] = [...(await tx.unsafe('select pg_export_snapshot() as id'))];
      const snapshotId: unknown = row?.id;
      if (typeof snapshotId !== 'string' || !SNAPSHOT_ID.test(snapshotId)) {
        throw new Error('backup: the database did not export a snapshot');
      }
      const built = await buildBackupManifest(async (text) => [...(await tx.unsafe(text))], takenAt);
      await runDump(
        [
          '--format=custom',
          '--no-owner',
          '--no-privileges',
          '--schema=app',
          `--snapshot=${snapshotId}`,
          '-f',
          i.dumpPath,
        ],
        env,
      );
      return built;
    });
  } finally {
    await session.end({ timeout: 5 });
  }
}
