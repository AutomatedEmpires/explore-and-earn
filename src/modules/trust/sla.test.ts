import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { newId } from '@/lib/ids';
import { notify } from '@/modules/notifications';
import { schedules } from '@/server/schedules';
import { jobHandlers, openReviewItem, slaSweep } from './index';
import { addOperator, auditActions, getItem, resetTrustTables, setShift } from './test-fixtures';

vi.mock('@/modules/notifications', () => ({
  notify: vi.fn(async () => {}),
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

const HOUR = 60 * 60 * 1000;
const hoursFromNow = (h: number) => new Date(Date.now() + h * HOUR);

const openModeration = () =>
  openReviewItem(t.db, {
    queue: 'moderation',
    subjectType: 'test_item',
    subjectId: newId(),
    reason: 'test',
  });

describe('slaSweep', () => {
  it('alerts the Owner when nobody is on shift, and loses nothing (Review Focus 4)', async () => {
    const owner = await addOperator(t.db, { role: 'owner', shift: 'away' });
    const { id } = await openModeration();
    expect(await getItem(t.db, id)).toMatchObject({ status: 'open', assignee_operator_id: null });

    // Within the time limit nothing happens.
    expect(await slaSweep(t.db, hoursFromNow(23))).toEqual({ reassigned: 0, breached: 0 });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();

    const result = await slaSweep(t.db, hoursFromNow(25));

    expect(result).toEqual({ reassigned: 0, breached: 1 });
    const item = await getItem(t.db, id);
    expect(item.status).toBe('open');
    expect(item.sla_breached_at).not.toBeNull();
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.anything(),
      owner,
      'operator.alert',
      expect.objectContaining({ severity: 'critical', kind: 'sla_breach', itemId: id }),
    );
    expect(await auditActions(t.db, id)).toEqual(['trust.item_opened', 'trust.alert']);
  });

  it('marks a breach and alerts only once', async () => {
    await addOperator(t.db, { role: 'owner', shift: 'away' });
    const { id } = await openModeration();

    await slaSweep(t.db, hoursFromNow(25));
    const firstBreach = (await getItem(t.db, id)).sla_breached_at;
    expect(await slaSweep(t.db, hoursFromNow(26))).toEqual({ reassigned: 0, breached: 0 });

    expect((await getItem(t.db, id)).sla_breached_at).toBe(firstBreach);
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
  });

  it('reassigns an overdue item to another on-shift operator and restarts its clock', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const { id } = await openModeration();
    expect((await getItem(t.db, id)).assignee_operator_id).toBe(a);
    const b = await addOperator(t.db, { queues: ['moderation'] });

    const now = hoursFromNow(25);
    expect(await slaSweep(t.db, now)).toEqual({ reassigned: 1, breached: 0 });

    const item = await getItem(t.db, id);
    expect(item.assignee_operator_id).toBe(b);
    expect(item.status).toBe('assigned');
    expect(item.sla_breached_at).toBeNull();
    expect(new Date(item.sla_due_at).getTime()).toBe(now.getTime() + 24 * HOUR);
    expect(new Date(item.assigned_at ?? 0).getTime()).toBe(now.getTime());
    expect(await auditActions(t.db, id)).toEqual(['trust.item_opened', 'trust.sla_reassigned']);
  });

  it('assigns an overdue unassigned item once someone comes on shift', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const { id } = await openModeration();
    await setShift(t.db, a, 'on_shift');

    expect(await slaSweep(t.db, hoursFromNow(25))).toEqual({ reassigned: 1, breached: 0 });
    expect(await getItem(t.db, id)).toMatchObject({ status: 'assigned', assignee_operator_id: a });
  });

  it('breaches an overdue item when its assignee is the only operator on shift', async () => {
    const a = await addOperator(t.db, { role: 'owner' });
    const { id } = await openModeration();

    expect(await slaSweep(t.db, hoursFromNow(25))).toEqual({ reassigned: 0, breached: 1 });
    const item = await getItem(t.db, id);
    expect(item.assignee_operator_id).toBe(a);
    expect(item.sla_breached_at).not.toBeNull();
  });

  it('uses the queue time limit: child safety is overdue after 1 hour', async () => {
    await addOperator(t.db, { role: 'owner', shift: 'away' });
    const { id } = await openReviewItem(t.db, {
      queue: 'child_safety',
      subjectType: 'media',
      subjectId: newId(),
      reason: 'hash match',
    });
    vi.mocked(notify).mockClear();

    expect((await slaSweep(t.db, hoursFromNow(0.5))).breached).toBe(0);
    expect((await slaSweep(t.db, hoursFromNow(1.5))).breached).toBe(1);
    expect((await getItem(t.db, id)).sla_breached_at).not.toBeNull();
  });

  it('ignores resolved items', async () => {
    await addOperator(t.db, { role: 'owner', shift: 'away' });
    const { id } = await openModeration();
    await t.db.execute(sql`
      update app.review_items set status = 'resolved', resolution = 'approve', resolved_at = now()
      where id = ${id}::uuid
    `);
    expect(await slaSweep(t.db, hoursFromNow(25))).toEqual({ reassigned: 0, breached: 0 });
  });
});

describe('scheduling', () => {
  it('registers the sweep every 5 minutes and handles its topic', async () => {
    expect(schedules).toContainEqual({ topic: 'review.sla_sweep', cron: '*/5 * * * *' });
    const handler = jobHandlers['review.sla_sweep'];
    expect(handler).toBeTypeOf('function');

    await addOperator(t.db, { role: 'owner', shift: 'away' });
    const { id } = await openModeration();
    await handler?.(null, { db: t.db, now: hoursFromNow(25) });
    expect((await getItem(t.db, id)).sla_breached_at).not.toBeNull();
  });
});
