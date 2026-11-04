import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { setSetting } from '@/modules/settings';
import { schedules } from '@/server/schedules';
import { auditSample, jobHandlers } from './index';
import { resetTrustTables } from './test-fixtures';

vi.mock('@/modules/notifications', () => ({
  notify: vi.fn(async () => {}),
  // Modules loaded through identity (orgs) register their notification types at load.
  defineType: vi.fn(),
  jobHandlers: {},
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await resetTrustTables(t.db);
});

afterEach(() => {
  vi.clearAllMocks();
});

const NOW = new Date('2026-11-09T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** Inserts `n` trust checks with `decision`, created `daysAgo` before NOW. */
async function seedChecks(n: number, decision: string, daysAgo = 1): Promise<void> {
  const at = new Date(NOW.getTime() - daysAgo * DAY);
  await t.db.execute(sql`
    insert into app.trust_checks
      (id, kind, subject_type, subject_id, provider, model, prompt_version, score, labels,
       reason, decision, latency_ms, created_at)
    select gen_random_uuid(), 'text_safety', 'test_item', gen_random_uuid()::text, 'stub',
      'claude-haiku-5-5', 'text_safety@1', 0.02, '{}', 'stub', ${decision}, 5,
      ${at}::timestamptz + make_interval(secs => g)
    from generate_series(1, ${n}::int) as g
  `);
}

/** A rand() that returns 0, 1/1000, 2/1000, ... */
function sequence(): () => number {
  let i = 0;
  return () => i++ / 1000;
}

const sampled = () =>
  queryRows<{ queue: string; check_id: string; subject_type: string; subject_id: string }>(
    t.db,
    sql`select queue, check_id, subject_type, subject_id from app.review_items`,
  );

describe('auditSample', () => {
  it("samples rate x total of the past week's automatic decisions", async () => {
    await seedChecks(600, 'approved');
    await seedChecks(400, 'rejected', 3);

    expect(await auditSample(t.db, NOW, 0.01, sequence())).toBe(10);

    const items = await sampled();
    expect(items).toHaveLength(10);
    for (const item of items) expect(item.queue).toBe('audit_sample');
    // Each item points at the check it samples and at that check's subject.
    const [row] = await queryRows<{ ok: boolean }>(
      t.db,
      sql`
        select bool_and(c.subject_type = r.subject_type and c.subject_id = r.subject_id) as ok
        from app.review_items r join app.trust_checks c on c.id = r.check_id
      `,
    );
    expect(row?.ok).toBe(true);
  });

  it('leaves out reviews, older checks and checks already sampled', async () => {
    await seedChecks(50, 'needs_review');
    await seedChecks(50, 'approved', 8);
    await seedChecks(5, 'approved');

    expect(await auditSample(t.db, NOW, 1, () => 0)).toBe(5);
    expect(await auditSample(t.db, NOW, 1, () => 0)).toBe(0);
    expect(await sampled()).toHaveLength(5);
  });

  it('reads the rate from trust.audit_sample_rate by default', async () => {
    await seedChecks(20, 'approved');
    await setSetting(t.db, 'trust.audit_sample_rate', 0.5, { operatorId: newId() });

    // rand 0, 0.001, ... are all below 0.5.
    expect(await auditSample(t.db, NOW, undefined, sequence())).toBe(20);
  });

  it('samples nothing at rate 0', async () => {
    await seedChecks(20, 'approved');
    expect(await auditSample(t.db, NOW, 0, () => 0)).toBe(0);
  });
});

describe('scheduling', () => {
  it('runs every Monday at 09:00 UTC through its job handler', async () => {
    expect(schedules).toContainEqual({ topic: 'trust.audit_sample', cron: '0 9 * * 1' });
    const handler = jobHandlers['trust.audit_sample'];
    expect(handler).toBeTypeOf('function');

    await seedChecks(3, 'approved');
    await setSetting(t.db, 'trust.audit_sample_rate', 1, { operatorId: newId() });
    await handler?.(null, { db: t.db, now: NOW });
    expect(await sampled()).toHaveLength(3);
  });
});
