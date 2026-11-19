import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedOperator, seedSeeker } from '../../../tests/helpers/sp8';
import { releaseLegalHold, setLegalHold } from './holds';
import {
  isErasureRecorded,
  RETENTION_BATCH,
  RETENTION_HOLD_COVERAGE,
  retentionJobHandlers,
  retentionRules,
  runRetentionRule,
  runRetentionSweep,
} from './retention';
import { coreRetentionRules, createExportsRule, type ExportStore } from './retention-rules';
import type { RetentionRule } from './types';

const NOW = new Date('2026-11-03T03:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let t: TestDb;
let userId: string;
/** The audit log is append-only, so each test reads only the rows written after it started. */
let testStart: string;

beforeAll(async () => {
  t = await createTestDb();
  userId = (await seedOperator(t.db, { role: 'owner' })).userId;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`delete from app.retention_runs`);
  const [clock] = await queryRows<{ at: string }>(t.db, sql`select clock_timestamp()::text as at`);
  testStart = clock?.at ?? '';
  await t.db.execute(sql`delete from app.rate_limits`);
  await t.db.execute(sql`delete from app.privacy_requests`);
});

type RunRow = {
  id: string;
  rule_key: string;
  status: string;
  deleted: number;
  error: string | null;
  finished_at: string | null;
};

async function runs(): Promise<RunRow[]> {
  return queryRows<RunRow>(
    t.db,
    sql`select id, rule_key, status, deleted, error, finished_at from app.retention_runs
        order by rule_key, created_at`,
  );
}

type JobRow = { topic: string; payload: { key: string; runId: string }; dedupe_key: string };

async function jobs(): Promise<JobRow[]> {
  return queryRows<JobRow>(
    t.db,
    sql`select topic, payload, dedupe_key from app.outbox
        where topic = 'privacy.retention_rule' order by dedupe_key`,
  );
}

async function alerts(): Promise<{ kind: string; message: string }[]> {
  const rows = await queryRows<{ data: { kind: string; message: string } }>(
    t.db,
    sql`select data from app.audit_events
        where action = 'trust.alert' and created_at > ${testStart}::timestamptz
        order by created_at`,
  );
  return rows.map((row) => ({ kind: row.data.kind, message: row.data.message }));
}

function fakeRule(key: string, run: RetentionRule['run']): RetentionRule {
  return { key, description: `Test rule ${key}.`, run };
}

async function openRun(key: string, startedAt: Date = NOW): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.retention_runs (id, rule_key, started_at, status)
    values (${id}, ${key}, ${startedAt.toISOString()}::timestamptz, 'running')
  `);
  return id;
}

describe('runRetentionSweep', () => {
  it('opens one run row and one job per rule', async () => {
    const rules = [
      fakeRule('test.first', async () => ({ deleted: 0 })),
      fakeRule('test.second', async () => ({ deleted: 0 })),
    ];

    expect(await runRetentionSweep(t.db, NOW, { rules })).toEqual({ queued: 2 });

    const rows = await runs();
    expect(rows.map((row) => [row.rule_key, row.status])).toEqual([
      ['test.first', 'running'],
      ['test.second', 'running'],
    ]);
    const queued = await jobs();
    expect(queued.map((job) => job.dedupe_key)).toEqual([
      'retention:test.first:2026-11-03',
      'retention:test.second:2026-11-03',
    ]);
    expect(queued.map((job) => job.payload)).toEqual([
      { key: 'test.first', runId: rows[0]?.id },
      { key: 'test.second', runId: rows[1]?.id },
    ]);
  });

  it('opens nothing new when it runs twice on one day, and opens again the next day', async () => {
    const rules = [fakeRule('test.first', async () => ({ deleted: 0 }))];

    await runRetentionSweep(t.db, NOW, { rules });
    expect(await runRetentionSweep(t.db, new Date(NOW.getTime() + 60_000), { rules })).toEqual({
      queued: 0,
    });
    expect(await runs()).toHaveLength(1);
    expect(await jobs()).toHaveLength(1);

    expect(await runRetentionSweep(t.db, new Date(NOW.getTime() + DAY_MS), { rules })).toEqual({
      queued: 1,
    });
    expect(await runs()).toHaveLength(2);
    expect(await jobs()).toHaveLength(2);
  });

  it('the job handlers run the sweep and then each rule', async () => {
    const seen: { now: Date; limit: number }[] = [];
    const rules = [
      fakeRule('test.first', async (_db, now, limit) => {
        seen.push({ now, limit });
        return { deleted: 4 };
      }),
    ];
    await runRetentionSweep(t.db, NOW, { rules });
    const [job] = await jobs();
    if (!job) throw new Error('no job');

    expect(await runRetentionRule(t.db, { ...job.payload, now: NOW }, { rules })).toEqual({
      deleted: 4,
      status: 'ok',
    });
    expect(seen).toEqual([{ now: NOW, limit: RETENTION_BATCH }]);
    expect(Object.keys(retentionJobHandlers).sort()).toEqual([
      'privacy.retention_rule',
      'privacy.retention_sweep',
    ]);
    await expect(
      retentionJobHandlers['privacy.retention_rule']?.({ key: '', runId: 'x' }, { db: t.db, now: NOW }),
    ).rejects.toThrow();
  });
});

describe('runRetentionRule', () => {
  it('records an ok run with its count and an audit event', async () => {
    const rules = [fakeRule('test.first', async () => ({ deleted: 7 }))];
    const runId = await openRun('test.first');

    expect(await runRetentionRule(t.db, { key: 'test.first', runId, now: NOW }, { rules })).toEqual(
      { deleted: 7, status: 'ok' },
    );

    const [row] = await runs();
    expect(row).toMatchObject({ id: runId, status: 'ok', deleted: 7, error: null });
    expect(row?.finished_at).not.toBeNull();
    const audit = await queryRows<{ subject_id: string; data: unknown }>(
      t.db,
      sql`select subject_id, data from app.audit_events
          where action = 'privacy.retention_run' and subject_id = ${runId}`,
    );
    expect(audit).toEqual([
      { subject_id: runId, data: { key: 'test.first', deleted: 7, status: 'ok' } },
    ]);
    expect(await jobs()).toEqual([]);
  });

  it('a rule returning exactly 5,000 is partial and queues one follow-up run', async () => {
    const rules = [fakeRule('test.first', async () => ({ deleted: 5000 }))];
    const runId = await openRun('test.first');

    expect(await runRetentionRule(t.db, { key: 'test.first', runId, now: NOW }, { rules })).toEqual(
      { deleted: 5000, status: 'partial' },
    );

    const rows = await runs();
    expect(rows.map((row) => row.status).sort()).toEqual(['partial', 'running']);
    const followUp = rows.find((row) => row.status === 'running');
    const queued = await jobs();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toEqual({ key: 'test.first', runId: followUp?.id });
    expect(queued[0]?.dedupe_key).toBe(`retention:test.first:${followUp?.id}`);
  });

  it('4,999 rows is ok, with no follow-up', async () => {
    const rules = [fakeRule('test.first', async () => ({ deleted: 4999 }))];
    const runId = await openRun('test.first');

    expect(
      (await runRetentionRule(t.db, { key: 'test.first', runId, now: NOW }, { rules })).status,
    ).toBe('ok');
    expect(await jobs()).toEqual([]);
  });

  it('a throwing rule is failed with one alert, while the other rule is ok', async () => {
    const rules = [
      fakeRule('test.broken', async () => {
        throw new Error('relation does not exist');
      }),
      fakeRule('test.fine', async () => ({ deleted: 1 })),
    ];
    const broken = await openRun('test.broken');
    const fine = await openRun('test.fine');

    const failed = await runRetentionRule(t.db, { key: 'test.broken', runId: broken, now: NOW }, { rules });
    const ok = await runRetentionRule(t.db, { key: 'test.fine', runId: fine, now: NOW }, { rules });

    expect(failed).toEqual({ deleted: 0, status: 'failed' });
    expect(ok).toEqual({ deleted: 1, status: 'ok' });
    const rows = await runs();
    expect(rows.find((row) => row.id === broken)).toMatchObject({
      status: 'failed',
      error: 'relation does not exist',
    });
    expect(rows.find((row) => row.id === fine)).toMatchObject({ status: 'ok', error: null });
    expect(await alerts()).toEqual([
      { kind: 'retention_failed', message: 'A retention rule failed: test.broken.' },
    ]);
    const notified = await queryRows(
      t.db,
      sql`select 1 from app.notifications where user_id = ${userId} and type = 'operator.alert'`,
    );
    expect(notified.length).toBeGreaterThanOrEqual(1);
  });

  it('alerts at most once per rule per day', async () => {
    const rules = [
      fakeRule('test.broken', async () => {
        throw new Error('still broken');
      }),
      fakeRule('test.other', async () => {
        throw new Error('also broken');
      }),
    ];
    const later = new Date(NOW.getTime() + 60_000);
    const tomorrow = new Date(NOW.getTime() + DAY_MS);

    await runRetentionRule(t.db, { key: 'test.broken', runId: await openRun('test.broken'), now: NOW }, { rules });
    await runRetentionRule(
      t.db,
      { key: 'test.broken', runId: await openRun('test.broken', later), now: later },
      { rules },
    );
    expect(await alerts()).toHaveLength(1);

    // Another rule failing the same day, and the same rule the next day, each alert.
    await runRetentionRule(t.db, { key: 'test.other', runId: await openRun('test.other'), now: NOW }, { rules });
    await runRetentionRule(
      t.db,
      { key: 'test.broken', runId: await openRun('test.broken', tomorrow), now: tomorrow },
      { rules },
    );
    expect((await alerts()).map((a) => a.message)).toEqual([
      'A retention rule failed: test.broken.',
      'A retention rule failed: test.other.',
      'A retention rule failed: test.broken.',
    ]);
  });

  it('a rule that runs past the timeout is failed and never rethrows', async () => {
    // A rule that never settles at all is covered on a real Postgres (retention.int.test.ts):
    // there the database ends its transaction. PGlite has one connection, which the rule's
    // open transaction holds until the rule settles.
    const rules = [
      fakeRule('test.slow', async () => {
        await sleep(150);
        return { deleted: 3 };
      }),
    ];
    const runId = await openRun('test.slow');

    const result = await runRetentionRule(
      t.db,
      { key: 'test.slow', runId, now: NOW },
      { rules, timeoutMs: 20 },
    );

    expect(result).toEqual({ deleted: 0, status: 'failed' });
    expect((await runs())[0]).toMatchObject({ status: 'failed', deleted: 0 });
    expect((await runs())[0]?.error).toMatch(/^Timed out/);
  });

  it('a rule that times out keeps nothing it deleted, so "failed, 0 deleted" is the truth', async () => {
    for (const key of ['a', 'b', 'c']) {
      await t.db.execute(sql`
        insert into app.rate_limits (key, window_start, count)
        values (${key}, ${new Date(NOW.getTime() - 10 * DAY_MS).toISOString()}::timestamptz, 1)
      `);
    }
    const rules = [
      fakeRule('test.slow', async (db) => {
        const gone = await queryRows(db, sql`delete from app.rate_limits returning key`);
        await sleep(150);
        return { deleted: gone.length };
      }),
    ];
    const runId = await openRun('test.slow');

    const result = await runRetentionRule(
      t.db,
      { key: 'test.slow', runId, now: NOW },
      { rules, timeoutMs: 20 },
    );

    expect(result).toEqual({ deleted: 0, status: 'failed' });
    const kept = await queryRows<{ key: string }>(t.db, sql`select key from app.rate_limits`);
    expect(kept.map((row) => row.key).sort()).toEqual(['a', 'b', 'c']);
    const audit = await queryRows<{ data: unknown }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'privacy.retention_run' and subject_id = ${runId}`,
    );
    expect(audit).toEqual([{ data: { key: 'test.slow', deleted: 0, status: 'failed' } }]);
  });

  it('a rule that throws keeps nothing it deleted before throwing', async () => {
    await t.db.execute(sql`
      insert into app.rate_limits (key, window_start, count)
      values ('kept', ${new Date(NOW.getTime() - 10 * DAY_MS).toISOString()}::timestamptz, 1)
    `);
    const rules = [
      fakeRule('test.broken', async (db) => {
        await db.execute(sql`delete from app.rate_limits`);
        throw new Error('storage is down');
      }),
    ];
    const runId = await openRun('test.broken');

    expect(
      await runRetentionRule(t.db, { key: 'test.broken', runId, now: NOW }, { rules }),
    ).toEqual({ deleted: 0, status: 'failed' });
    expect(await queryRows(t.db, sql`select key from app.rate_limits`)).toEqual([{ key: 'kept' }]);
  });

  it('runs the rule in one transaction the database also limits, and commits it in time', async () => {
    await t.db.execute(sql`
      insert into app.rate_limits (key, window_start, count)
      values ('old', ${new Date(NOW.getTime() - 10 * DAY_MS).toISOString()}::timestamptz, 1)
    `);
    let limits: unknown;
    const rules = [
      fakeRule('test.fine', async (db) => {
        limits = (
          await queryRows(
            db,
            sql`select current_setting('statement_timeout') as statement,
                  current_setting('idle_in_transaction_session_timeout') as idle`,
          )
        )[0];
        const gone = await queryRows(db, sql`delete from app.rate_limits returning key`);
        return { deleted: gone.length };
      }),
    ];
    const runId = await openRun('test.fine');

    expect(
      await runRetentionRule(
        t.db,
        { key: 'test.fine', runId, now: NOW },
        { rules, timeoutMs: 45_000 },
      ),
    ).toEqual({ deleted: 1, status: 'ok' });
    // Each statement, and each wait between statements, is stopped by the database shortly
    // after the limit (RETENTION_DB_GRACE_MS, 5 s).
    expect(limits).toEqual({ statement: '50s', idle: '50s' });
    expect(await queryRows(t.db, sql`select key from app.rate_limits`)).toEqual([]);
    // The limits were local to the rule's transaction.
    expect(
      await queryRows(t.db, sql`select current_setting('statement_timeout') as statement`),
    ).toEqual([{ statement: '0' }]);
  });

  it('an unknown rule key is failed, not thrown', async () => {
    const runId = await openRun('test.gone');

    expect(
      await runRetentionRule(t.db, { key: 'test.gone', runId, now: NOW }, { rules: [] }),
    ).toEqual({ deleted: 0, status: 'failed' });
  });

  it('a finished run is not run again (a retried job deletes nothing twice)', async () => {
    const run = vi.fn(async () => ({ deleted: 3 }));
    const rules = [fakeRule('test.first', run)];
    const runId = await openRun('test.first');

    await runRetentionRule(t.db, { key: 'test.first', runId, now: NOW }, { rules });
    const again = await runRetentionRule(t.db, { key: 'test.first', runId, now: NOW }, { rules });

    expect(again).toEqual({ deleted: 3, status: 'ok' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never stores query parameters in the error', async () => {
    const rules = [
      fakeRule('test.broken', async () => {
        throw new Error('Failed query: select 1 where email = $1\nparams: maya@example.test');
      }),
    ];
    const runId = await openRun('test.broken');

    await runRetentionRule(t.db, { key: 'test.broken', runId, now: NOW }, { rules });

    expect((await runs())[0]?.error).not.toContain('maya@example.test');
  });
});

describe('privacy.rate_limit_windows_2d', () => {
  const rule = coreRetentionRules.find((r) => r.key === 'privacy.rate_limit_windows_2d');
  if (!rule) throw new Error('rule missing');
  const limitAt = new Date(NOW.getTime() - 2 * DAY_MS);

  async function seed(key: string, windowStart: Date): Promise<void> {
    await t.db.execute(sql`
      insert into app.rate_limits (key, window_start, count)
      values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
    `);
  }

  async function keys(): Promise<string[]> {
    const rows = await queryRows<{ key: string }>(t.db, sql`select key from app.rate_limits order by key`);
    return rows.map((row) => row.key);
  }

  it('uses the exact description', () => {
    expect(rule.description).toBe('Rate-limit counters are deleted after 2 days.');
  });

  it('keeps a window exactly 2 days old and deletes one 1 ms older', async () => {
    await seed('at-limit', limitAt);
    await seed('older', new Date(limitAt.getTime() - 1));

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await keys()).toEqual(['at-limit']);
  });

  it('deletes at most `limit` rows', async () => {
    for (const key of ['a', 'b', 'c']) await seed(key, new Date(limitAt.getTime() - 1000));

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(await keys()).toHaveLength(1);
  });
});

describe('privacy.exports_7d', () => {
  function memoryStore(): ExportStore & { removed: string[] } {
    const removed: string[] = [];
    return {
      removed,
      async remove(bucket, path) {
        removed.push(`${bucket}/${path}`);
      },
    };
  }

  async function seedExport(
    expiresAt: Date,
    owner: string = userId,
  ): Promise<{ id: string; path: string }> {
    const id = newId();
    const path = `${id}.zip`;
    await t.db.execute(sql`
      insert into app.privacy_requests (id, user_id, kind, status, export_path,
        export_size_bytes, export_expires_at, completed_at)
      values (${id}, ${owner}, 'export', 'completed', ${path}, 10,
        ${expiresAt.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz)
    `);
    return { id, path };
  }

  it('keeps the download of a person with a hold on all, until the hold is released', async () => {
    const store = memoryStore();
    const heldUser = (await seedSeeker(t.db)).userId;
    const otherScope = (await seedSeeker(t.db)).userId;
    const hold = (owner: string, scope: 'all' | 'messages') =>
      setLegalHold(
        t.db,
        { userId: owner, scope, reason: 'Court order 26-0042 for this account', reviewAt: '2026-12-01', operatorId: userId },
        NOW,
      );
    const { holdId } = await hold(heldUser, 'all');
    await hold(otherScope, 'messages');
    const kept = await seedExport(new Date(NOW.getTime() - 1), heldUser);
    const gone = await seedExport(new Date(NOW.getTime() - 1), otherScope);
    const rule = createExportsRule(async () => store);

    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(store.removed).toEqual([`privacy-exports/${gone.path}`]);
    expect(await paths()).toEqual({ [kept.id]: kept.path, [gone.id]: null });

    await releaseLegalHold(t.db, { holdId, operatorId: userId }, NOW);
    expect(await rule.run(t.db, NOW, 100)).toEqual({ deleted: 1 });
    expect(await paths()).toEqual({ [kept.id]: null, [gone.id]: null });
  });

  async function paths(): Promise<Record<string, string | null>> {
    const rows = await queryRows<{ id: string; export_path: string | null }>(
      t.db,
      sql`select id, export_path from app.privacy_requests`,
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.export_path]));
  }

  it('uses the exact description', () => {
    expect(createExportsRule(async () => memoryStore()).description).toBe(
      "Your data downloads are deleted 7 days after they're ready.",
    );
  });

  it('keeps an export expiring exactly now and deletes one that expired 1 ms ago', async () => {
    const store = memoryStore();
    const atLimit = await seedExport(NOW);
    const expired = await seedExport(new Date(NOW.getTime() - 1));

    const result = await createExportsRule(async () => store).run(t.db, NOW, 100);

    expect(result).toEqual({ deleted: 1 });
    expect(store.removed).toEqual([`privacy-exports/${expired.path}`]);
    expect(await paths()).toEqual({ [atLimit.id]: atLimit.path, [expired.id]: null });
  });

  it('deletes at most `limit` exports, keeps the request rows, and does nothing on a second run', async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await seedExport(new Date(NOW.getTime() - 1000 - i));
    const rule = createExportsRule(async () => store);

    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 2 });
    expect(store.removed).toHaveLength(2);
    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 1 });
    expect(await rule.run(t.db, NOW, 2)).toEqual({ deleted: 0 });
    expect(store.removed).toHaveLength(3);
    expect(Object.values(await paths())).toEqual([null, null, null]);
  });

  it('leaves the path in place when the object cannot be removed, so the next run retries', async () => {
    const expired = await seedExport(new Date(NOW.getTime() - 1));
    const broken: ExportStore = {
      async remove() {
        throw new Error('storage is down');
      },
    };

    await expect(createExportsRule(async () => broken).run(t.db, NOW, 100)).rejects.toThrow(
      'storage is down',
    );
    expect(await paths()).toEqual({ [expired.id]: expired.path });
  });
});

describe('the privacy module rules and the ledger check', () => {
  it('registers the two core rules', () => {
    expect(retentionRules.map((r) => r.key)).toEqual([
      'privacy.rate_limit_windows_2d',
      'privacy.exports_7d',
    ]);
  });

  it('every registered rule says how it honours legal holds (lead decision 2026-11-18)', async () => {
    const { privacyRegistry } = await import('@/server/privacy-registry');

    expect(privacyRegistry.rules.map((rule) => rule.key).sort()).toEqual(
      Object.keys(RETENTION_HOLD_COVERAGE).sort(),
    );
  });

  it('isErasureRecorded is true only for a user in the deletion ledger', async () => {
    const erased = newId();
    await t.db.execute(sql`
      insert into app.privacy_deletion_ledger (id, user_id, request_id, erased_at)
      values (${newId()}, ${erased}, ${newId()}, ${NOW.toISOString()}::timestamptz)
    `);

    expect(await isErasureRecorded(t.db, erased)).toBe(true);
    expect(await isErasureRecorded(t.db, newId())).toBe(false);
  });
});
