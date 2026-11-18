import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  buildBackupManifest,
  compareManifest,
  parseManifest,
  pgEnvFromUrl,
  verifyRestore,
  type BackupManifest,
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

const workflow = (name: string) =>
  readFileSync(path.resolve('.github/workflows', name), 'utf8');

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
    const runbook = readFileSync(path.resolve('docs/runbooks/backups.md'), 'utf8');
    for (const name of names) expect(runbook).toContain(`\`${name}\``);
    // No connection string or key is written into the file.
    expect(yml).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|eyJ[A-Za-z0-9_-]{10,}/);
  });

  it('keeps 35 days of dumps and of deleted files', () => {
    expect(code(yml)).toMatch(/rclone delete --min-age 35d backupcrypt:pg\n/);
    expect(code(yml)).toMatch(/rclone delete --min-age 35d backupcrypt:files-deleted\n/);
  });
});
