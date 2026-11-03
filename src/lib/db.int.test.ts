// Runs against a real Postgres with PostGIS (CI's postgis service, already migrated by
// `pnpm db:migrate`). Covers the postgres.js path that unit tests on PGlite can't.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows, withTx } from './db';
import { runMigrations } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

afterAll(async () => {
  await closeClient(db);
});

describe('postgres.js database', () => {
  it('is fully migrated and a second run applies nothing', async () => {
    expect(await runMigrations(db)).toEqual([]);
    const rows = await queryRows<{ v: string }>(db, sql`select postgis_version() as v`);
    expect(rows[0]?.v).toBeTruthy();
  });

  it('accepts Date parameters in raw SQL', async () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const rows = await queryRows<{ past: boolean; day: string }>(
      db,
      sql`select (${at}::timestamptz < now()) as past, ${at}::date::text as day`,
    );
    expect(rows[0]).toEqual({ past: true, day: '2026-01-01' });
  });

  it('runs transactions on one connection and rolls back on error', async () => {
    await db.execute(sql`create table if not exists app.int_probe (id int primary key)`);
    await db.execute(sql`truncate app.int_probe`);
    await expect(
      withTx(db, async (tx) => {
        await tx.execute(sql`insert into app.int_probe (id) values (1)`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.int_probe`,
    );
    expect(rows[0]?.n).toBe(0);
    await db.execute(sql`drop table app.int_probe`);
  });
});
