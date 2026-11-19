// CI Postgres (the integration job). Locally, typecheck this file; do not run it.
//
// What only a real Postgres shows about a retention rule that runs too long (PGlite has one
// connection and no timers):
// - runRetentionRule returns at the limit even when the rule never settles, because the record
//   goes out on another connection while the rule's transaction is still open;
// - the database itself then stops the rule: statement_timeout cancels a long statement, and
//   idle_in_transaction_session_timeout ends a transaction left waiting;
// - nothing the rule deleted is kept, so "failed, 0 deleted" is the truth.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { RETENTION_DB_GRACE_MS, runRetentionRule, type RetentionRule } from '@/modules/privacy';

const fromEnv = process.env.DATABASE_URL;
if (!fromEnv) throw new Error('DATABASE_URL is required for integration tests');
const url: string = fromEnv;

const LIMIT_MS = 500;
let db: Db;
const keys: string[] = [];
const runIds: string[] = [];

beforeAll(() => {
  db = createDb(url);
});

afterAll(async () => {
  for (const key of keys) await db.execute(sql`delete from app.rate_limits where key = ${key}`);
  for (const id of runIds) await db.execute(sql`delete from app.retention_runs where id = ${id}`);
  await closeClient(db);
});

/** A rate-limit window well past every limit, which a test rule deletes. */
async function seedWindow(): Promise<string> {
  const key = `retention-int-${newId()}`;
  await db.execute(sql`
    insert into app.rate_limits (key, window_start, count)
    values (${key}, now() - interval '10 days', 1)
  `);
  keys.push(key);
  return key;
}

async function windowExists(key: string): Promise<boolean> {
  const rows = await queryRows(db, sql`select 1 as one from app.rate_limits where key = ${key}`);
  return rows.length === 1;
}

async function openRun(ruleKey: string): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.retention_runs (id, rule_key, started_at, status)
    values (${id}, ${ruleKey}, now(), 'running')
  `);
  runIds.push(id);
  return id;
}

async function runRow(id: string): Promise<{ status: string; deleted: number; error: string | null }> {
  const [row] = await queryRows<{ status: string; deleted: number; error: string | null }>(
    db,
    sql`select status, deleted, error from app.retention_runs where id = ${id}`,
  );
  if (!row) throw new Error('no run row');
  return row;
}

/** Sessions other than this one whose current or last statement contains `marker`. */
async function sessionsRunning(marker: string, state: 'active' | 'idle in transaction'): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`
      select count(*)::int as n from pg_stat_activity
      where pid <> pg_backend_pid() and state = ${state} and strpos(query, ${marker}) > 0
    `,
  );
  return row?.n ?? 0;
}

/** Polls `check` every 200 ms until it is true or `ms` has passed. */
async function until(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return check();
}

function rule(key: string, run: RetentionRule['run']): RetentionRule {
  return { key, description: `Test rule ${key}.`, run };
}

describe('a retention rule past its limit (postgres)', () => {
  it('a long statement: recorded at the limit, cancelled by the database, nothing kept', async () => {
    const key = await seedWindow();
    const marker = `retention-int-sleep-${newId()}`;
    const slow = rule('test.slow_statement', async (tx) => {
      await tx.execute(sql`delete from app.rate_limits where key = ${key}`);
      await tx.execute(sql`select pg_sleep(120), ${sql.raw(`'${marker}'`)}`);
      return { deleted: 1 };
    });
    const runId = await openRun(slow.key);

    const started = Date.now();
    const result = await runRetentionRule(
      db,
      { key: slow.key, runId, now: new Date() },
      { rules: [slow], timeoutMs: LIMIT_MS },
    );

    expect(Date.now() - started).toBeLessThan(LIMIT_MS + 3_000);
    expect(result).toEqual({ deleted: 0, status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', deleted: 0 });
    expect((await runRow(runId)).error).toMatch(/^Timed out/);
    // Without statement_timeout the sleep would hold its connection for two minutes.
    expect(
      await until(async () => (await sessionsRunning(marker, 'active')) === 0, RETENTION_DB_GRACE_MS + 10_000),
    ).toBe(true);
    expect(await windowExists(key)).toBe(true);
  });

  it('a rule that never settles: recorded at the limit, its transaction ended by the database, nothing kept', async () => {
    const key = await seedWindow();
    const marker = `retention-int-stuck-${newId()}`;
    const stuck = rule('test.stuck', async (tx) => {
      await tx.execute(sql`delete from app.rate_limits where key = ${key}`);
      await tx.execute(sql`select ${sql.raw(`'${marker}'`)}`);
      return new Promise<never>(() => {});
    });
    const runId = await openRun(stuck.key);

    const started = Date.now();
    const result = await runRetentionRule(
      db,
      { key: stuck.key, runId, now: new Date() },
      { rules: [stuck], timeoutMs: LIMIT_MS },
    );

    expect(Date.now() - started).toBeLessThan(LIMIT_MS + 3_000);
    expect(result).toEqual({ deleted: 0, status: 'failed' });
    expect(await runRow(runId)).toMatchObject({ status: 'failed', deleted: 0 });
    // The delete is not committed while the transaction waits, and is rolled back when the
    // database ends it.
    expect(await windowExists(key)).toBe(true);
    expect(
      await until(
        async () => (await sessionsRunning(marker, 'idle in transaction')) === 0,
        RETENTION_DB_GRACE_MS + 10_000,
      ),
    ).toBe(true);
    expect(await windowExists(key)).toBe(true);
  });
});
