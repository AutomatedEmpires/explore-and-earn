import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  buildBackupManifest,
  compareManifest,
  parseManifest,
  pgEnvFromUrl,
  takeConsistentBackup,
  verifyRestore,
  type BackupManifest,
  type BackupSession,
} from './backup-manifest';

const NOW = new Date('2026-11-03T02:00:00.000Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db.execute(sql`delete from app.users`);
  const created = ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', '2026-10-03T12:34:56.789Z'];
  for (const at of created) {
    const id = newId();
    await t.db.execute(sql`
      insert into app.users (id, clerk_user_id, created_at)
      values (${id}, ${`user_${id}`}, ${at}::timestamptz)
    `);
  }
});

afterAll(async () => {
  await t.close();
});

function manifest(tables: BackupManifest['tables'], migrations: string[] = ['0000_init.sql']): BackupManifest {
  return { takenAt: NOW.toISOString(), migrations, tables };
}

describe('buildBackupManifest', () => {
  it('counts every app table, with its newest created_at and the applied migrations', async () => {
    const built = await buildBackupManifest(t.db, NOW);

    expect(built.takenAt).toBe('2026-11-03T02:00:00.000Z');
    expect(built.tables.users).toEqual({ rows: 3, maxCreatedAt: '2026-10-03T12:34:56.789000Z' });
    expect(built.migrations).toContain('7000_privacy.sql');
    expect(built.migrations).toEqual([...built.migrations].sort());
    // An empty table is listed with no newest row; a table without created_at has none either.
    expect(built.tables.privacy_requests).toEqual({ rows: 0, maxCreatedAt: null });
    expect(built.tables.schema_migrations).toEqual({
      rows: built.migrations.length,
      maxCreatedAt: null,
    });
  });

  it('lists exactly the base tables of schema app', async () => {
    const built = await buildBackupManifest(t.db, NOW);
    const [count] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from information_schema.tables
          where table_schema = 'app' and table_type = 'BASE TABLE'`,
    );

    expect(Object.keys(built.tables)).toHaveLength(count?.n ?? -1);
    expect(Object.keys(built.tables)).toEqual(Object.keys(built.tables).sort());
  });

  it('matches itself: a database compared with its own manifest has no differences', async () => {
    const first = await buildBackupManifest(t.db, NOW);
    const second = await buildBackupManifest(t.db, new Date());

    expect(compareManifest(first, second)).toEqual([]);
  });
});

describe('compareManifest', () => {
  const three = manifest({ users: { rows: 3, maxCreatedAt: '2026-10-03T00:00:00.000000Z' } });

  it('reports a table with fewer rows than expected', () => {
    const two = manifest({ users: { rows: 2, maxCreatedAt: '2026-10-02T00:00:00.000000Z' } });

    expect(compareManifest(three, two)).toEqual(['users: expected 3 rows, found 2']);
  });

  it('returns nothing for equal manifests, whatever their takenAt', () => {
    expect(compareManifest(three, { ...three, takenAt: '2026-11-04T00:00:00.000Z' })).toEqual([]);
  });

  it('reports the same count with a different newest row', () => {
    const other = manifest({ users: { rows: 3, maxCreatedAt: '2026-10-04T00:00:00.000000Z' } });

    expect(compareManifest(three, other)).toEqual([
      'users: expected newest row 2026-10-03T00:00:00.000000Z, found 2026-10-04T00:00:00.000000Z',
    ]);
  });

  it('reports a missing table, an extra table and migration differences', () => {
    const expected = manifest(
      { users: { rows: 3, maxCreatedAt: null }, outbox: { rows: 1, maxCreatedAt: null } },
      ['0000_init.sql', '7000_privacy.sql'],
    );
    const actual = manifest(
      { users: { rows: 3, maxCreatedAt: null }, extra: { rows: 4, maxCreatedAt: null } },
      ['0000_init.sql', '7500_new.sql'],
    );

    expect(compareManifest(expected, actual)).toEqual([
      'extra: not in the manifest, found 4 rows',
      'outbox: expected 1 rows, found no table',
      'migrations: missing 7000_privacy.sql',
      'migrations: not in the manifest 7500_new.sql',
    ]);
  });
});

describe('verifyRestore', () => {
  it('passes for a fresh manifest of the same database', async () => {
    const taken = await buildBackupManifest(t.db, NOW);
    const result = await verifyRestore(t.db, taken, {
      now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    });

    expect(result).toEqual({ differences: [], restorePointAgeHours: 24 });
  });

  it('fails when the restore point is older than the limit', async () => {
    const taken = await buildBackupManifest(t.db, NOW);
    const result = await verifyRestore(t.db, taken, {
      now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 36_000),
    });

    expect(result.differences).toEqual(['restore point: 24.01 hours old, the limit is 24']);
  });
});

describe('parseManifest', () => {
  it('round-trips a manifest and refuses anything else', async () => {
    const built = await buildBackupManifest(t.db, NOW);

    expect(parseManifest(JSON.stringify(built))).toEqual(built);
    expect(() => parseManifest('{"tables":{}}')).toThrow(/not a manifest/);
    expect(() =>
      parseManifest('{"takenAt":"x","migrations":[],"tables":{"users":{"rows":"3"}}}'),
    ).toThrow(/bad entry for table users/);
  });
});

describe('takeConsistentBackup', () => {
  /** A session that records the order of events and holds no tables. */
  function fakeSession(events: string[]): BackupSession {
    return {
      async begin(mode, fn) {
        events.push(`begin ${mode}`);
        return fn({
          async unsafe(text: string) {
            if (text.includes('pg_export_snapshot()')) {
              events.push('snapshot');
              return [{ id: '00000003-0000001B-1' }];
            }
            events.push('manifest query');
            return [];
          },
        });
      },
      async end() {
        events.push('end');
      },
    };
  }

  it('reads the clock before the snapshot begins, so takenAt is never later than the snapshot', async () => {
    // An erasure that commits after the snapshot is not in the dump. The restore replays every
    // ledger entry from takenAt (less a margin), so takenAt must not be later than the snapshot.
    const events: string[] = [];
    const manifest = await takeConsistentBackup({
      databaseUrl: 'postgresql://backup_reader:secret@db.example.test:5432/postgres',
      dumpPath: '/tmp/never-written.pgcustom',
      session: fakeSession(events),
      clock: () => {
        events.push('clock');
        return NOW;
      },
      runDump: async (args) => {
        events.push(`dump ${args.find((arg) => arg.startsWith('--snapshot=')) ?? ''}`);
      },
    });

    expect(events).toEqual([
      'clock',
      'begin isolation level repeatable read read only',
      'snapshot',
      'manifest query',
      'dump --snapshot=00000003-0000001B-1',
      'end',
    ]);
    expect(manifest).toEqual({ takenAt: NOW.toISOString(), migrations: [], tables: {} });
  });

  it('reads the clock once, and ends the session when the dump fails', async () => {
    const events: string[] = [];
    const clock = vi.fn(() => NOW);

    await expect(
      takeConsistentBackup({
        databaseUrl: 'postgresql://backup_reader:secret@db.example.test:5432/postgres',
        dumpPath: '/tmp/never-written.pgcustom',
        session: fakeSession(events),
        clock,
        runDump: async () => {
          throw new Error('pg_dump exited with code 1');
        },
      }),
    ).rejects.toThrow('pg_dump exited with code 1');
    expect(clock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toBe('end');
  });
});

describe('pgEnvFromUrl', () => {
  it('turns a connection URL into libpq variables, so the password is never an argument', () => {
    expect(
      pgEnvFromUrl('postgresql://backup_reader.abc:p%40ss@pooler.example.test:5432/postgres?sslmode=require'),
    ).toEqual({
      PGHOST: 'pooler.example.test',
      PGPORT: '5432',
      PGDATABASE: 'postgres',
      PGUSER: 'backup_reader.abc',
      PGPASSWORD: 'p@ss',
      PGSSLMODE: 'require',
    });
  });

  it('refuses a URL that is not Postgres', () => {
    expect(() => pgEnvFromUrl('https://example.test/db')).toThrow(/postgres:\/\//);
  });
});

/** A file of this checkout with `\n` line endings, so a Windows checkout (CRLF) reads the same. */
const text = (file: string) => readFileSync(path.resolve(file), 'utf8').replace(/\r\n/g, '\n');

const workflow = (name: string) => text(`.github/workflows/${name}`);

/** The `run:` block of the step called `name`. */
function stepRun(yml: string, name: string): string {
  const at = yml.indexOf(`- name: ${name}\n`);
  if (at === -1) throw new Error(`no step named ${name}`);
  const rest = yml.slice(at + 1);
  const next = rest.search(/\n {6}- (name|uses|run):/);
  const step = next === -1 ? rest : rest.slice(0, next);
  const match = /\n {8}run: \|\n((?: {10}.*\n|\n)*)/.exec(`${step}\n`);
  if (!match) throw new Error(`step ${name} has no run block`);
  return match[1] ?? '';
}

/** The `on:` block: everything from `on:` to the next top-level key. */
function triggers(yml: string): string {
  const match = /^on:\n((?:[ \t]+.*\n|\n)*)/m.exec(yml);
  if (!match) throw new Error('no on: block');
  return match[1] ?? '';
}

/** Lines that are not comments. */
const code = (yml: string) =>
  yml
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

describe('backup.yml', () => {
  const yml = workflow('backup.yml');

  it('never reads the child-safety bucket', () => {
    expect(yml).not.toMatch(/evidence/i);
    const buckets = [...code(yml).matchAll(/\bprod:([$\w-]+)/g)].map((m) => m[1]);
    expect(buckets).toEqual(['$bucket']);
    expect(code(yml)).toMatch(/for bucket in media-public media-private; do/);
  });

  it('takes the dump only through backup:manifest --dump, never as its own session', () => {
    expect(yml).not.toMatch(/pg_dump/);
    expect(code(yml)).toMatch(/pnpm backup:manifest --out \S+ --dump \S+/);
  });

  it('stays off until the founder turns it on: manual start only, behind a variable and an environment', () => {
    expect(triggers(yml).trim()).toBe('workflow_dispatch:');
    expect(code(yml)).not.toMatch(/schedule:|cron:/);
    expect(code(yml)).toMatch(/if: vars\.BACKUPS_ENABLED == 'true' && github\.ref == 'refs\/heads\/main'/);
    expect(code(yml)).toMatch(/environment: backup\n/);
  });

  it('reads secrets by name only, and only the names the runbook lists', () => {
    const names = new Set([...yml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...names].sort()).toEqual([
      'BACKUP_CRYPT_PASSWORD',
      'BACKUP_CRYPT_SALT',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'PROD_BACKUP_DATABASE_URL',
      'PROD_S3_ACCESS_KEY_ID',
      'PROD_S3_ENDPOINT',
      'PROD_S3_SECRET_ACCESS_KEY',
    ]);
    const runbook = text('docs/runbooks/backups.md');
    for (const name of names) expect(runbook).toContain(`\`${name}\``);
    // No connection string or key is written into the file.
    expect(yml).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|eyJ[A-Za-z0-9_-]{10,}/);
  });

  it('keeps deleted files for 35 days from the day they were deleted, not from their own age', () => {
    // How long is decided by planPrune (backup-prune.test.ts tests it): a dated folder goes
    // only when its date is more than 35 days before the run's date. This checks the workflow
    // hands every dated folder of both areas to it, and deletes nothing any other way.
    expect(stepRun(yml, 'Sync the media buckets')).toMatch(
      /--backup-dir "backupcrypt:files-deleted\/\$BACKUP_DATE\/\$bucket"/,
    );
    const prune = code(stepRun(yml, 'Delete dumps and kept files older than 35 days'));
    expect(prune).toMatch(/^ *set -euo pipefail\n/);
    expect(prune).toMatch(/for area in pg files-deleted; do\n/);
    expect(prune).toMatch(/rclone lsf --dirs-only "backupcrypt:\$area\/" > "\$listing"/);
    expect(prune).toMatch(
      /pnpm --silent exec tsx scripts\/backup-prune\.ts --today "\$BACKUP_DATE" --keep-days 35 \\\n\s+< "\$listing" > "\$due"\n/,
    );
    expect(prune).toMatch(/rclone purge "backupcrypt:\$area\/\$folder"\n/);
    // rclone keeps a file's modification time when --backup-dir moves it, so any age filter
    // would delete an old file the night it was deleted.
    expect(code(yml)).not.toMatch(/--min-age|--max-age|rclone delete\b/);
    expect(code(yml).match(/rclone purge/g)).toHaveLength(1);
  });
});
