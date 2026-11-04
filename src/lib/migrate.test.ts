import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmptyTestDb, createTestDb, type TestDb } from '../../tests/helpers/db';
import { queryRows } from './db';
import { runMigrations } from './migrate';

const migrationFiles = readdirSync(path.resolve('drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('runMigrations', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createEmptyTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it('applies every migration on a fresh database, then nothing on a second run', async () => {
    const first = await runMigrations(t.db);
    expect(first[0]).toBe('0000_init.sql');
    expect(first).toEqual(migrationFiles);

    const second = await runMigrations(t.db);
    expect(second).toEqual([]);
    // Creating PostGIS inside 0000_init.sql takes most of this. On a loaded ARM machine it can
    // pass 30s, which used to abort the run after only the first file had committed.
  }, 90_000);

  it('enables PostGIS', async () => {
    const rows = await queryRows<{ v: string }>(t.db, sql`select postgis_version() as v`);
    const version = rows[0]?.v;
    expect(typeof version).toBe('string');
    expect(version?.length).toBeGreaterThan(0);
  });

  it('records applied migrations in app.schema_migrations', async () => {
    const reg = await queryRows<{ r: string | null }>(
      t.db,
      sql`select to_regclass('app.schema_migrations')::text as r`,
    );
    expect(reg[0]?.r).not.toBeNull();

    const names = await queryRows<{ name: string }>(
      t.db,
      sql`select name from app.schema_migrations order by name`,
    );
    expect(names.map((r) => r.name)).toEqual(migrationFiles);
  });

  it('installs app.set_updated_at()', async () => {
    await t.db.execute(sql`
      create table app.migrate_probe (
        id int primary key,
        updated_at timestamptz not null default '2000-01-01T00:00:00Z'
      )
    `);
    await t.db.execute(sql`
      create trigger migrate_probe_updated_at before update on app.migrate_probe
      for each row execute function app.set_updated_at()
    `);
    await t.db.execute(sql`insert into app.migrate_probe (id) values (1)`);
    await t.db.execute(sql`update app.migrate_probe set id = 2`);
    const rows = await queryRows<{ year: number }>(
      t.db,
      sql`select extract(year from updated_at)::int as year from app.migrate_probe`,
    );
    expect(rows[0]?.year).toBeGreaterThan(2000);
  });
});

describe('runMigrations with a failing file', () => {
  let t: TestDb;
  let dir: string;

  beforeAll(async () => {
    t = await createEmptyTestDb();
    dir = mkdtempSync(path.join(tmpdir(), 'ee-migrations-'));
    writeFileSync(
      path.join(dir, '0000_ok.sql'),
      'create schema if not exists app; create table app.ok (id int);',
    );
    writeFileSync(
      path.join(dir, '0001_bad.sql'),
      'create table app.half (id int); select no_such_function();',
    );
  });

  afterAll(async () => {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('rolls back the failing file and does not record it', async () => {
    await expect(runMigrations(t.db, dir)).rejects.toThrow(/0001_bad\.sql/);

    const tables = await queryRows<{ ok: string | null; half: string | null }>(
      t.db,
      sql`select to_regclass('app.ok')::text as ok, to_regclass('app.half')::text as half`,
    );
    expect(tables[0]?.ok).not.toBeNull();
    expect(tables[0]?.half).toBeNull();

    const names = await queryRows<{ name: string }>(
      t.db,
      sql`select name from app.schema_migrations`,
    );
    expect(names.map((r) => r.name)).toEqual(['0000_ok.sql']);
  });
});

describe('createTestDb', () => {
  it('returns a migrated database', async () => {
    const t = await createTestDb();
    try {
      const names = await queryRows<{ name: string }>(
        t.db,
        sql`select name from app.schema_migrations order by name`,
      );
      expect(names.map((r) => r.name)).toEqual(migrationFiles);
      const postgis = await queryRows<{ v: string }>(t.db, sql`select postgis_version() as v`);
      expect(postgis[0]?.v).toBeTruthy();
    } finally {
      await t.close();
    }
  });

  it('returns isolated databases', async () => {
    const [a, b] = await Promise.all([createTestDb(), createTestDb()]);
    try {
      await a.db.execute(sql`create table app.isolation_probe (id int)`);
      const inB = await queryRows<{ r: string | null }>(
        b.db,
        sql`select to_regclass('app.isolation_probe')::text as r`,
      );
      expect(inB[0]?.r).toBeNull();
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });
});
