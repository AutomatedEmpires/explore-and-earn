// CI Postgres (the integration job). Locally, typecheck this file; do not run it.
//
// Two things only a real Postgres can prove:
// - the dump and its manifest read one snapshot (Plan decision 35);
// - the `backup_reader` role, created exactly as docs/runbooks/backups.md says, reads every row.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { buildBackupManifest, takeConsistentBackup } from './backup-manifest';

const fromEnv = process.env.DATABASE_URL;
if (!fromEnv) throw new Error('DATABASE_URL is required for integration tests');
const url: string = fromEnv;

const READER_PASSWORD = 'integration-test-only';
const seededUsers: string[] = [];
const seededJobs: string[] = [];
let db: Db;

async function seedUser(target: Db): Promise<string> {
  const id = newId();
  await target.execute(
    sql`insert into app.users (id, clerk_user_id) values (${id}, ${`backup_test_${id}`})`,
  );
  seededUsers.push(id);
  return id;
}

async function dropReader(): Promise<void> {
  const [role] = await queryRows(db, sql`select 1 from pg_roles where rolname = 'backup_reader'`);
  if (!role) return;
  await db.execute(sql`drop owned by backup_reader`);
  await db.execute(sql`drop role backup_reader`);
}

beforeAll(async () => {
  db = createDb(url);
  await dropReader();
  await seedUser(db);
});

afterAll(async () => {
  for (const id of seededJobs) await db.execute(sql`delete from app.outbox where id = ${id}`);
  for (const id of seededUsers) await db.execute(sql`delete from app.users where id = ${id}`);
  await dropReader();
  await closeClient(db);
});

describe('takeConsistentBackup (postgres)', () => {
  it('builds the manifest and runs the dump inside one exported snapshot', async () => {
    const before = await buildBackupManifest(db);
    const seen: { args: string[]; env: Record<string, string>; snapshotUsable: boolean }[] = [];

    const manifest = await takeConsistentBackup({
      databaseUrl: url,
      dumpPath: '/tmp/never-written.pgcustom',
      runDump: async (args, env) => {
        // Rows committed while the dump runs must not appear in the manifest.
        const userId = await seedUser(db);
        const jobId = newId();
        await db.execute(sql`
          insert into app.outbox (id, topic, payload) values (${jobId}, 'backup.test', '{}'::jsonb)
        `);
        seededJobs.push(jobId);
        expect(userId).toBeTruthy();

        // The exporting transaction is still open: another session can adopt its snapshot,
        // which Postgres refuses once that transaction has ended. This is what pg_dump does.
        const snapshot = args.find((arg) => arg.startsWith('--snapshot='))?.slice(11) ?? '';
        const other = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
        let snapshotUsable = false;
        try {
          await other.begin('isolation level repeatable read read only', async (tx) => {
            await tx.unsafe(`set transaction snapshot '${snapshot.replaceAll("'", '')}'`);
            const [row] = await tx.unsafe(
              `select count(*)::int as n from app.users where id = '${userId}'`,
            );
            // Inside the snapshot the new user does not exist yet.
            snapshotUsable = row?.n === 0;
          });
        } finally {
          await other.end({ timeout: 5 });
        }
        seen.push({ args, env, snapshotUsable });
      },
    });

    expect(seen).toHaveLength(1);
    const call = seen[0];
    expect(call?.snapshotUsable).toBe(true);
    expect(call?.args).toEqual([
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--schema=app',
      expect.stringMatching(/^--snapshot=[0-9A-F-]+$/i),
      '-f',
      '/tmp/never-written.pgcustom',
    ]);
    // The connection travels in the environment, never in the arguments.
    expect(call?.args.join(' ')).not.toContain('postgres:');
    expect(call?.env.PGHOST).toBeTruthy();

    expect(manifest.tables.users?.rows).toBe(before.tables.users?.rows);
    expect(manifest.tables.outbox?.rows).toBe(before.tables.outbox?.rows);

    const after = await buildBackupManifest(db);
    expect(after.tables.users?.rows).toBe((before.tables.users?.rows ?? 0) + 1);
    expect(after.tables.outbox?.rows).toBe((before.tables.outbox?.rows ?? 0) + 1);
  });

  it('throws when the dump fails', async () => {
    await expect(
      takeConsistentBackup({
        databaseUrl: url,
        dumpPath: '/tmp/never-written.pgcustom',
        runDump: async () => {
          throw new Error('pg_dump exited with code 1');
        },
      }),
    ).rejects.toThrow('pg_dump exited with code 1');
  });
});

/** The first ```sql block after the marker line in the runbook. */
function runbookRoleSql(): string {
  // `\n` line endings, so a Windows checkout (CRLF) reads the same.
  const runbook = readFileSync(path.resolve('docs/runbooks/backups.md'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const match = /<!-- backup_reader:sql -->\s*```sql\n([\s\S]*?)```/.exec(runbook);
  if (!match?.[1]) throw new Error('docs/runbooks/backups.md has no backup_reader SQL block');
  return match[1];
}

describe('the documented backup_reader role (postgres)', () => {
  it('reads every table: its manifest equals the owner connection manifest', async () => {
    const statements = runbookRoleSql().replace('<a long random password>', READER_PASSWORD);
    expect(statements).toContain(`password '${READER_PASSWORD}'`);
    expect(statements).toMatch(/\bbypassrls\b/);

    const admin = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    try {
      await admin.unsafe(statements).simple();
    } finally {
      await admin.end({ timeout: 5 });
    }

    const readerUrl = new URL(url);
    readerUrl.username = 'backup_reader';
    readerUrl.password = READER_PASSWORD;
    const reader = createDb(readerUrl.toString());
    try {
      const now = new Date();
      const asReader = await buildBackupManifest(reader, now);
      const asOwner = await buildBackupManifest(db, now);

      expect(asReader.tables).toEqual(asOwner.tables);
      expect(asReader.migrations).toEqual(asOwner.migrations);
      expect(asReader.tables.users?.rows).toBeGreaterThan(0);

      // Read-only: the role may not even attempt a write (this statement matches no row).
      await expect(reader.execute(sql`delete from app.outbox where false`)).rejects.toThrow();
    } finally {
      await closeClient(reader);
    }
  });
});
