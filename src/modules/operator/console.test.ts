import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { makeFakeClerkAdmin } from '@/modules/identity';
import { addNote, claim, decide, openReviewItem, type Queue } from '@/modules/trust';
import {
  createTestItem,
  DEFAULT_TEST_ITEM_TEXT,
  getReviewItem,
  inviteOperator,
  listOperators,
  listReviewItems,
  mayOpenItem,
  queueCounts,
  reviewItemQueue,
  setOperatorQueues,
  setShiftStatus,
  testItemText,
  type ItemViewer,
} from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.review_actions`);
  await t.db.execute(sql`delete from app.review_notes`);
  await t.db.execute(sql`update app.review_items set original_item_id = null`);
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.trust_checks`);
  await t.db.execute(sql`delete from app.notifications`);
  await t.db.execute(sql`delete from app.outbox`);
  await t.db.execute(sql`delete from app.operators`);
  await t.db.execute(sql`delete from app.users`);
});

async function addOperator(
  name: string,
  o: { role?: 'owner' | 'operator'; queues?: string[]; shift?: 'on_shift' | 'away' } = {},
): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${name.toLowerCase()}@ops.test`}, ${name}, 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (
      ${id}, ${o.role ?? 'operator'}, ${`{${(o.queues ?? []).join(',')}}`}::text[],
      ${o.shift ?? 'away'}
    )
  `);
  return id;
}

const open = (queue: Queue = 'moderation', priority = 0) =>
  openReviewItem(t.db, {
    queue,
    subjectType: 'test_item',
    subjectId: newId(),
    reason: `${queue} item`,
    priority,
  });

async function rejected(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

async function auditCount(action: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.audit_events where action = ${action}`,
  );
  return row?.n ?? 0;
}

describe('review item reads', () => {
  it('counts every queue, including empty ones', async () => {
    const owner = await addOperator('Avery', { role: 'owner' });
    const first = await open('moderation');
    await open('moderation');
    await open('fraud');
    await claim(t.db, first.id, owner);

    const counts = await queueCounts(t.db);
    expect(counts).toHaveLength(8);
    expect(counts.find((c) => c.queue === 'moderation')).toMatchObject({
      open: 1,
      assigned: 1,
      escalated: 0,
      overdue: 0,
    });
    expect(counts.find((c) => c.queue === 'fraud')).toMatchObject({ open: 1 });
    expect(counts.find((c) => c.queue === 'billing')).toMatchObject({ open: 0, assigned: 0 });

    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect((await queueCounts(t.db, later)).find((c) => c.queue === 'moderation')?.overdue).toBe(2);
  });

  it('lists the most urgent first and filters by queue, status and assignee', async () => {
    const owner = await addOperator('Avery', { role: 'owner' });
    const low = await open('moderation', 0);
    const high = await open('moderation', 5);
    const fraud = await open('fraud');
    await claim(t.db, low.id, owner);

    const all = await listReviewItems(t.db);
    expect(all.total).toBe(3);
    expect(all.items[0]?.id).toBe(high.id);

    const moderation = await listReviewItems(t.db, { queue: 'moderation' });
    expect(moderation.items.map((i) => i.id).sort()).toEqual([low.id, high.id].sort());

    const mine = await listReviewItems(t.db, { assigneeId: owner });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ id: low.id, assigneeName: 'Avery', status: 'assigned' });

    expect((await listReviewItems(t.db, { status: 'open' })).items.map((i) => i.id).sort()).toEqual(
      [high.id, fraud.id].sort(),
    );
    expect((await listReviewItems(t.db, { status: 'resolved' })).total).toBe(0);
    expect((await listReviewItems(t.db, { assigneeId: 'not-a-uuid' })).total).toBe(0);
  });

  it('reads one item with its notes and decisions', async () => {
    const avery = await addOperator('Avery', { role: 'owner' });
    const bo = await addOperator('Bo', { queues: ['moderation'] });
    const item = await open('moderation');
    await claim(t.db, item.id, avery);
    await addNote(t.db, item.id, avery, `@[Bo](${bo}) have a look`);
    await decide(t.db, item.id, avery, 'ban');

    const detail = await getReviewItem(t.db, item.id);
    expect(detail).toMatchObject({
      id: item.id,
      queue: 'moderation',
      status: 'assigned',
      assigneeId: avery,
      assigneeName: 'Avery',
      check: null,
    });
    expect(detail?.notes).toEqual([
      expect.objectContaining({
        authorName: 'Avery',
        body: `@[Bo](${bo}) have a look`,
        mentions: [bo],
      }),
    ]);
    // Two operators exist, so the ban waits for a second one.
    expect(detail?.actions).toEqual([
      expect.objectContaining({ action: 'ban', actorName: 'Avery', status: 'pending_second' }),
    ]);
    expect(await reviewItemQueue(t.db, item.id)).toBe('moderation');
    expect(await getReviewItem(t.db, newId())).toBeNull();
    expect(await reviewItemQueue(t.db, 'nope')).toBeNull();
  });
});

describe('queue access', () => {
  // Queue assignment is the console's access boundary (spec section 12): an operator opens and
  // lists only the items of queues they cover, and Owners cover every queue.
  async function team() {
    const avery = await addOperator('Avery', { role: 'owner' });
    const bo = await addOperator('Bo', { queues: ['moderation'] });
    const cy = await addOperator('Cy', { queues: ['fraud'] });
    return {
      avery: { userId: avery, role: 'owner' as const, queues: [] },
      bo: { userId: bo, role: 'operator' as const, queues: ['moderation'] },
      cy: { userId: cy, role: 'operator' as const, queues: ['fraud'] },
    };
  }

  async function detail(id: string) {
    const item = await getReviewItem(t.db, id);
    if (!item) throw new Error('no item');
    return item;
  }

  it('opens an item for operators covering its queue and for Owners only', async () => {
    const { avery, bo, cy } = await team();
    const childSafety = await detail((await open('child_safety')).id);
    const moderation = await detail((await open('moderation')).id);

    expect(mayOpenItem(bo, childSafety)).toBe(false);
    expect(mayOpenItem(cy, childSafety)).toBe(false);
    expect(mayOpenItem(avery, childSafety)).toBe(true);
    expect(mayOpenItem(bo, moderation)).toBe(true);
    expect(mayOpenItem(cy, moderation)).toBe(false);
  });

  it('opens a decision waiting for a second sign-off to anyone but its author', async () => {
    // Any operator but the author may sign off (trust.approveSecond), whatever they cover, so a
    // held ban never waits on nobody: they must be able to open it.
    const { avery, bo, cy } = await team();
    const item = await open('child_safety');
    await claim(t.db, item.id, avery.userId);
    await decide(t.db, item.id, avery.userId, 'ban');
    const held = await detail(item.id);
    expect(held.actions[0]?.status).toBe('pending_second');

    expect(mayOpenItem(bo, held)).toBe(true);
    expect(mayOpenItem(cy, held)).toBe(true);
    // Its author, were they not an Owner, would still need to cover the queue.
    expect(mayOpenItem({ ...avery, role: 'operator' }, held)).toBe(false);
  });

  it('lists only what the viewer may open', async () => {
    const { avery, bo, cy } = await team();
    const moderation = await open('moderation');
    const fraud = await open('fraud');
    const childSafety = await open('child_safety');
    const held = await open('child_safety');
    await claim(t.db, held.id, avery.userId);
    await decide(t.db, held.id, avery.userId, 'ban');

    const ids = async (viewer: ItemViewer, queue?: Queue) =>
      (await listReviewItems(t.db, { visibleTo: viewer, ...(queue ? { queue } : {}) })).items
        .map((i) => i.id)
        .sort();

    expect(await ids(avery)).toEqual([moderation.id, fraud.id, childSafety.id, held.id].sort());
    expect(await ids(bo)).toEqual([moderation.id, held.id].sort());
    expect(await ids(cy)).toEqual([fraud.id, held.id].sort());
    expect(await ids(bo, 'fraud')).toEqual([]);
    expect(await ids({ ...bo, queues: [] })).toEqual([held.id]);
    expect((await listReviewItems(t.db, { visibleTo: bo })).total).toBe(2);
  });
});

describe('operators', () => {
  it('lists Owners first with their queues, shift and items in hand', async () => {
    const bo = await addOperator('Bo', { queues: ['moderation', 'fraud'], shift: 'on_shift' });
    const avery = await addOperator('Avery', { role: 'owner' });
    const item = await open('moderation');
    await claim(t.db, item.id, bo);

    expect(await listOperators(t.db)).toEqual([
      expect.objectContaining({ userId: avery, name: 'Avery', role: 'owner', inHand: 0 }),
      expect.objectContaining({
        userId: bo,
        name: 'Bo',
        role: 'operator',
        queues: ['moderation', 'fraud'],
        shiftStatus: 'on_shift',
        inHand: 1,
      }),
    ]);
  });

  it('lets only an Owner set queues, and audits it', async () => {
    const avery = await addOperator('Avery', { role: 'owner' });
    const bo = await addOperator('Bo', { queues: ['moderation'] });

    expect((await rejected(setOperatorQueues(t.db, bo, bo, ['fraud']))).code).toBe('forbidden');
    expect((await rejected(setOperatorQueues(t.db, avery, bo, ['nope']))).code).toBe('bad_request');

    await setOperatorQueues(t.db, avery, bo, ['fraud', 'moderation', 'fraud']);
    const bos = (await listOperators(t.db)).find((o) => o.userId === bo);
    expect(bos?.queues).toEqual(['moderation', 'fraud']);
    expect(await auditCount('operator.queues_updated')).toBe(1);
  });

  it('lets operators set their own shift, and Owners anyone’s', async () => {
    const avery = await addOperator('Avery', { role: 'owner' });
    const bo = await addOperator('Bo');
    const cy = await addOperator('Cy');

    await setShiftStatus(t.db, bo, bo, 'on_shift');
    expect((await rejected(setShiftStatus(t.db, bo, cy, 'on_shift'))).code).toBe('forbidden');
    await setShiftStatus(t.db, avery, cy, 'on_shift');
    // No change, no audit event.
    await setShiftStatus(t.db, avery, cy, 'on_shift');

    const shifts = Object.fromEntries(
      (await listOperators(t.db)).map((o) => [o.name, o.shiftStatus]),
    );
    expect(shifts).toEqual({ Avery: 'away', Bo: 'on_shift', Cy: 'on_shift' });
    expect(await auditCount('operator.shift_changed')).toBe(2);
  });

  it('lets only an Owner invite operators', async () => {
    const avery = await addOperator('Avery', { role: 'owner' });
    const bo = await addOperator('Bo');
    const clerk = makeFakeClerkAdmin();

    expect(
      (await rejected(inviteOperator(t.db, clerk, bo, { email: 'new@ops.test', role: 'operator' })))
        .code,
    ).toBe('forbidden');
    expect(
      (await rejected(inviteOperator(t.db, clerk, avery, { email: 'nope', role: 'operator' })))
        .code,
    ).toBe('bad_request');

    await inviteOperator(t.db, clerk, avery, { email: ' New@Ops.test ', role: 'operator' });
    expect(clerk.invitations).toEqual([{ email: 'new@ops.test', role: 'operator' }]);
    expect(await auditCount('operator.invited')).toBe(1);
  });
});

describe('test items', () => {
  it('sends a flagged text through the text check into the moderation queue', async () => {
    const avery = await addOperator('Avery', { role: 'owner' });

    const created = await createTestItem(t.db, avery);
    expect(created.decision).toBe('needs_review');
    expect(created.itemId).not.toBeNull();

    const item = await getReviewItem(t.db, created.itemId ?? '');
    expect(item).toMatchObject({ queue: 'moderation', subjectType: 'test_item' });
    expect(item?.check).toMatchObject({
      kind: 'text_safety',
      decision: 'needs_review',
      score: 0.5,
    });
    expect(await testItemText(t.db, created.subjectId)).toBe(DEFAULT_TEST_ITEM_TEXT);
    expect(await auditCount('operator.test_item_created')).toBe(1);
  });

  it('approves harmless text without opening an item, and refuses non-operators', async () => {
    const avery = await addOperator('Avery', { role: 'owner' });
    expect(await createTestItem(t.db, avery, 'hello')).toMatchObject({
      decision: 'approved',
      itemId: null,
    });
    expect((await rejected(createTestItem(t.db, newId()))).code).toBe('forbidden');
    expect((await rejected(createTestItem(t.db, avery, '   '))).code).toBe('bad_request');
  });
});
