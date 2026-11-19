import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { notify } from '@/modules/notifications';
import { SLA_HOURS, openReviewItem, pickAssignee, raiseAlert } from './index';
import { addOperator, auditActions, getItem, resetTrustTables, setShift } from './test-fixtures';
import type { Queue } from './types';

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

const open = (queue: Queue = 'moderation', extra: { excludeOperatorIds?: string[] } = {}) =>
  openReviewItem(t.db, {
    queue,
    subjectType: 'test_item',
    subjectId: newId(),
    reason: 'test',
    ...extra,
  });

const HOUR = 60 * 60 * 1000;

describe('SLA_HOURS', () => {
  it('matches the queue time limits', () => {
    expect(SLA_HOURS).toEqual({
      child_safety: 1,
      fraud: 4,
      reports: 24,
      support: 24,
      moderation: 24,
      billing: 24,
      appeals: 24,
      audit_sample: 24,
    });
  });
});

describe('openReviewItem routing', () => {
  it('assigns the on-shift operator with the fewest open items', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const b = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    // Only A is on shift, so A takes the first two items.
    await open();
    await open();
    await setShift(t.db, b, 'on_shift');

    const { id } = await open();

    const item = await getItem(t.db, id);
    expect(item.assignee_operator_id).toBe(b);
    expect(item.status).toBe('assigned');
    expect(item.assigned_at).not.toBeNull();
    expect(await pickAssignee(t.db, 'moderation')).toBe(b);
    expect(a).not.toBe(b);
  });

  it('breaks a tie by the oldest last assignment, never-assigned first', async () => {
    const recent = await addOperator(t.db, {
      queues: ['moderation'],
      lastAssignedAt: new Date(Date.now() - HOUR),
    });
    const older = await addOperator(t.db, {
      queues: ['moderation'],
      lastAssignedAt: new Date(Date.now() - 5 * HOUR),
    });

    const first = await open();
    expect((await getItem(t.db, first.id)).assignee_operator_id).toBe(older);

    const never = await addOperator(t.db, { queues: ['moderation'], lastAssignedAt: null });
    // Loads are now older 1, recent 0, never 0: never (null) goes before recent.
    const second = await open();
    expect((await getItem(t.db, second.id)).assignee_operator_id).toBe(never);
    const third = await open();
    expect((await getItem(t.db, third.id)).assignee_operator_id).toBe(recent);
  });

  it('records the assignment time on the operator', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    await open();
    const [row] = await queryRows<{ last_assigned_at: string | null }>(
      t.db,
      sql`select last_assigned_at from app.operators where user_id = ${a}::uuid`,
    );
    expect(row?.last_assigned_at).not.toBeNull();
  });

  it('never picks an operator who is away', async () => {
    await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    await addOperator(t.db, { role: 'owner', shift: 'away' });

    const { id } = await open();

    expect(await getItem(t.db, id)).toMatchObject({ status: 'open', assignee_operator_id: null });
  });

  it('only picks operators covering the queue, while owners cover every queue', async () => {
    await addOperator(t.db, { queues: ['support'] });
    expect(await pickAssignee(t.db, 'fraud')).toBeNull();

    const owner = await addOperator(t.db, { role: 'owner', queues: [] });
    expect(await pickAssignee(t.db, 'fraud')).toBe(owner);
  });

  it('skips excluded operators and deleted accounts', async () => {
    const a = await addOperator(t.db, { queues: ['appeals'] });
    const b = await addOperator(t.db, { queues: ['appeals'] });
    await t.db.execute(sql`update app.users set deleted_at = now() where id = ${b}::uuid`);

    expect(await pickAssignee(t.db, 'appeals', [a])).toBeNull();
    const { id } = await open('appeals', { excludeOperatorIds: [a] });
    expect((await getItem(t.db, id)).assignee_operator_id).toBeNull();
  });

  it('keeps the item, unassigned, when nobody is on shift', async () => {
    const before = Date.now();
    const { id } = await open('fraud');

    const item = await getItem(t.db, id);
    expect(item).toMatchObject({ status: 'open', assignee_operator_id: null, assigned_at: null });
    const due = new Date(item.sla_due_at).getTime();
    expect(due).toBeGreaterThanOrEqual(before + 4 * HOUR - 1000);
    expect(due).toBeLessThanOrEqual(Date.now() + 4 * HOUR + 1000);
    expect(await auditActions(t.db, id)).toEqual(['trust.item_opened']);
  });
});

describe('alerts', () => {
  it('raises a critical alert to every owner for a child-safety item', async () => {
    const owner1 = await addOperator(t.db, { role: 'owner', shift: 'away' });
    const owner2 = await addOperator(t.db, { role: 'owner' });
    await addOperator(t.db, { queues: ['child_safety'] });

    const { id } = await openReviewItem(t.db, {
      queue: 'child_safety',
      subjectType: 'media',
      subjectId: newId(),
      reason: 'hash match',
      priority: 1000,
    });

    expect(vi.mocked(notify)).toHaveBeenCalledTimes(2);
    for (const owner of [owner1, owner2]) {
      expect(vi.mocked(notify)).toHaveBeenCalledWith(
        expect.anything(),
        owner,
        'operator.alert',
        expect.objectContaining({ severity: 'critical', kind: 'child_safety', itemId: id }),
      );
    }
    const alerts = await queryRows<{ data: { severity: string; kind: string } }>(
      t.db,
      sql`select data from app.audit_events where action = 'trust.alert' and subject_id = ${id}`,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.data).toMatchObject({ severity: 'critical', kind: 'child_safety' });
    expect((await getItem(t.db, id)).priority).toBe(1000);
  });

  it('does not alert for other queues', async () => {
    await addOperator(t.db, { role: 'owner' });
    await open('moderation');
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it('records an alert even when no owner exists', async () => {
    const subject = newId();
    await raiseAlert(t.db, {
      severity: 'warning',
      kind: 'test',
      message: 'Nobody to tell',
      data: { itemId: subject },
    });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
    expect(await auditActions(t.db, subject)).toEqual(['trust.alert']);
  });
});
