import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { queryRows } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { notify } from '@/modules/notifications';
import { setSetting } from '@/modules/settings';
import {
  addNote,
  approveSecond,
  claim,
  decide,
  escalate,
  handOff,
  openAppeal,
  openReviewItem,
  registerSubjectHandlers,
  rejectSecond,
} from './index';
import { testItemLog } from './subjects';
import { addOperator, auditActions, getItem, resetTrustTables, setShift } from './test-fixtures';
import type { Queue } from './types';

// A partial mock: deciding an unknown subject loads every module (see findSubjectHandler), and
// SP2 modules register notification types with defineType when they load.
vi.mock('@/modules/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/notifications')>()),
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
  testItemLog.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

const open = (queue: Queue = 'moderation') =>
  openReviewItem(t.db, { queue, subjectType: 'test_item', subjectId: newId(), reason: 'test' });

async function codeOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof AppError)) throw new Error(`expected an AppError, got ${String(err)}`);
  return err.code;
}

const actions = (itemId: string) =>
  queryRows<{
    id: string;
    action: string;
    status: string;
    actor_operator_id: string;
    second_operator_id: string | null;
  }>(t.db, sql`select * from app.review_actions where item_id = ${itemId}::uuid order by id`);

describe('claim', () => {
  it('gives the item to exactly one of two operators claiming at the same time', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const b = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const { id } = await open();

    const results = await Promise.allSettled([claim(t.db, id, a), claim(t.db, id, b)]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'conflict' });
    const item = await getItem(t.db, id);
    expect(item.status).toBe('assigned');
    expect([a, b]).toContain(item.assignee_operator_id);
  });

  it('is idempotent for the current assignee', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const { id } = await open();
    expect((await getItem(t.db, id)).assignee_operator_id).toBe(a);

    await claim(t.db, id, a);
    await claim(t.db, id, a);
    expect(await auditActions(t.db, id)).toEqual(['trust.item_opened']);
  });

  it('refuses operators outside the queue, strangers and resolved items', async () => {
    const support = await addOperator(t.db, { queues: ['support'] });
    const mod = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const { id } = await open();

    expect(await codeOf(claim(t.db, id, support))).toBe('forbidden');
    expect(await codeOf(claim(t.db, id, newId()))).toBe('forbidden');
    expect(await codeOf(claim(t.db, newId(), mod))).toBe('not_found');

    await claim(t.db, id, mod);
    await decide(t.db, id, mod, 'approve');
    expect(await codeOf(claim(t.db, id, mod))).toBe('conflict');
  });
});

describe('decide and the second sign-off', () => {
  it('applies a ban at once when there is only one operator', async () => {
    const a = await addOperator(t.db, { role: 'owner' });
    const { id } = await open();

    expect(await decide(t.db, id, a, 'ban')).toEqual({ status: 'applied' });

    expect(await getItem(t.db, id)).toMatchObject({
      status: 'resolved',
      resolution: 'ban',
      decided_by: a,
    });
    expect(testItemLog).toEqual([expect.objectContaining({ action: 'ban' })]);
    expect(await auditActions(t.db, id)).toContain('trust.decided');
  });

  it('holds a ban for a different second operator when there are two', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const b = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const { id } = await open();

    expect(await decide(t.db, id, a, 'ban')).toEqual({ status: 'pending_second' });
    expect((await getItem(t.db, id)).status).toBe('assigned');
    expect(testItemLog).toHaveLength(0);
    const [pending] = await actions(id);
    expect(pending).toMatchObject({
      action: 'ban',
      status: 'pending_second',
      actor_operator_id: a,
    });

    expect(await codeOf(approveSecond(t.db, pending?.id ?? '', a))).toBe('forbidden');
    expect((await getItem(t.db, id)).status).toBe('assigned');

    await approveSecond(t.db, pending?.id ?? '', b);

    expect(await getItem(t.db, id)).toMatchObject({
      status: 'resolved',
      resolution: 'ban',
      decided_by: a,
    });
    expect((await actions(id))[0]).toMatchObject({ status: 'applied', second_operator_id: b });
    expect(testItemLog).toEqual([expect.objectContaining({ action: 'ban' })]);
    expect(await auditActions(t.db, id)).toEqual(
      expect.arrayContaining(['trust.decision_pending', 'trust.decided']),
    );
    expect(await codeOf(approveSecond(t.db, pending?.id ?? '', b))).toBe('conflict');
  });

  it('applies a refund up to the threshold at once, and holds a larger one', async () => {
    const a = await addOperator(t.db, { queues: ['billing'] });
    await addOperator(t.db, { queues: ['billing'], shift: 'away' });

    const small = await open('billing');
    expect(await decide(t.db, small.id, a, 'refund', { amountCents: 40000 })).toEqual({
      status: 'applied',
    });
    const atLimit = await open('billing');
    expect(await decide(t.db, atLimit.id, a, 'refund', { amountCents: 50000 })).toEqual({
      status: 'applied',
    });
    const large = await open('billing');
    expect(await decide(t.db, large.id, a, 'refund', { amountCents: 60000 })).toEqual({
      status: 'pending_second',
    });
  });

  it('reads the refund threshold from settings', async () => {
    const a = await addOperator(t.db, { queues: ['billing'] });
    await addOperator(t.db, { queues: ['billing'], shift: 'away' });
    await setSetting(t.db, 'ops.second_signoff_refund_cents', 10000, { operatorId: a });

    const { id } = await open('billing');
    expect(await decide(t.db, id, a, 'refund', { amountCents: 20000 })).toEqual({
      status: 'pending_second',
    });
  });

  it('needs an amount for a refund and a known action', async () => {
    const a = await addOperator(t.db, { queues: ['billing'] });
    const { id } = await open('billing');
    expect(await codeOf(decide(t.db, id, a, 'refund'))).toBe('bad_request');
    expect(await codeOf(decide(t.db, id, a, 'refund', { amountCents: -5 }))).toBe('bad_request');
    // @ts-expect-error: not a ReviewAction
    expect(await codeOf(decide(t.db, id, a, 'delete_everything'))).toBe('bad_request');
  });

  it('takes the second sign-off from any other operator, even one outside the queue', async () => {
    const owner = await addOperator(t.db, { role: 'owner' });
    const support = await addOperator(t.db, { queues: ['support'], shift: 'away' });
    const first = await open();
    const second = await open();
    expect((await getItem(t.db, first.id)).assignee_operator_id).toBe(owner);

    // Two operators exist, so the Owner's ban waits; the only other one covers support alone.
    expect(await decide(t.db, first.id, owner, 'ban')).toEqual({ status: 'pending_second' });
    const [pending] = await actions(first.id);
    await approveSecond(t.db, pending?.id ?? '', support);

    expect(await getItem(t.db, first.id)).toMatchObject({
      status: 'resolved',
      resolution: 'ban',
      decided_by: owner,
    });
    expect((await actions(first.id))[0]).toMatchObject({
      status: 'applied',
      second_operator_id: support,
    });

    // They may turn one down as well.
    await decide(t.db, second.id, owner, 'ban');
    const [another] = await actions(second.id);
    await rejectSecond(t.db, another?.id ?? '', support);
    expect((await actions(second.id))[0]).toMatchObject({
      status: 'rejected',
      second_operator_id: support,
    });
  });

  it('allows one pending decision per item, and a withdrawn one frees it', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const b = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const { id } = await open();

    await decide(t.db, id, a, 'ban');
    expect(await codeOf(decide(t.db, id, a, 'remove'))).toBe('conflict');

    const [pending] = await actions(id);
    await rejectSecond(t.db, pending?.id ?? '', b);
    expect((await actions(id))[0]?.status).toBe('rejected');

    expect(await decide(t.db, id, a, 'remove')).toEqual({ status: 'applied' });
  });

  it('only lets the assignee or an Owner decide an assigned item', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const other = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const owner = await addOperator(t.db, { role: 'owner', shift: 'away' });
    const first = await open();
    const second = await open();
    expect((await getItem(t.db, first.id)).assignee_operator_id).toBe(a);

    expect(await codeOf(decide(t.db, first.id, other, 'approve'))).toBe('forbidden');
    expect(await decide(t.db, first.id, owner, 'approve')).toEqual({ status: 'applied' });
    expect(await decide(t.db, second.id, a, 'approve')).toEqual({ status: 'applied' });
    expect(await codeOf(decide(t.db, second.id, a, 'approve'))).toBe('conflict');
  });

  it('calls the handler registered for the subject type, in the same transaction', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const seen: { subjectId: string; data: unknown }[] = [];
    registerSubjectHandlers('widget', {
      remove: async (_db, subjectId, data) => {
        seen.push({ subjectId, data });
      },
    });
    const subjectId = newId();
    const { id } = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'widget',
      subjectId,
      reason: 'test',
    });

    expect(await codeOf(decide(t.db, id, a, 'approve'))).toBe('bad_request');
    await decide(t.db, id, a, 'remove', { note: 'Spam' });
    expect(seen).toEqual([{ subjectId, data: { note: 'Spam', reviewItemId: id } }]);

    const unknown = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'no_such_subject',
      subjectId: newId(),
      reason: 'test',
    });
    expect(await codeOf(decide(t.db, unknown.id, a, 'approve'))).toBe('bad_request');
  });

  it('rolls the decision back when the subject handler fails', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    registerSubjectHandlers('fragile', {
      approve: async () => {
        throw new Error('subject update failed');
      },
    });
    const { id } = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'fragile',
      subjectId: newId(),
      reason: 'test',
    });

    await expect(decide(t.db, id, a, 'approve')).rejects.toThrow('subject update failed');
    expect((await getItem(t.db, id)).status).toBe('assigned');
    expect(await actions(id)).toHaveLength(0);
  });
});

describe('handOff and escalate', () => {
  it('hands an item to another operator covering the queue', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const b = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const support = await addOperator(t.db, { queues: ['support'], shift: 'away' });
    const { id } = await open();

    expect(await codeOf(handOff(t.db, id, b, a))).toBe('forbidden');
    expect(await codeOf(handOff(t.db, id, a, support))).toBe('bad_request');
    await handOff(t.db, id, a, b);

    expect(await getItem(t.db, id)).toMatchObject({ status: 'assigned', assignee_operator_id: b });
    expect(await auditActions(t.db, id)).toContain('trust.handed_off');
  });

  it('escalates to the Owner with the fewest open items, bumps priority and notes why', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const busyOwner = await addOperator(t.db, { role: 'owner', displayName: 'Busy' });
    const freeOwner = await addOperator(t.db, {
      role: 'owner',
      displayName: 'Free',
      shift: 'away',
    });
    // Give the busy owner an item of their own.
    await setShift(t.db, a, 'away');
    await open('fraud');
    await setShift(t.db, a, 'on_shift');
    await setShift(t.db, busyOwner, 'away');
    const { id } = await open();
    expect((await getItem(t.db, id)).assignee_operator_id).toBe(a);

    await escalate(t.db, id, a, { reason: 'Possible scam ring' });

    expect(await getItem(t.db, id)).toMatchObject({
      status: 'escalated',
      priority: 100,
      escalated_to: freeOwner,
      assignee_operator_id: freeOwner,
    });
    const notes = await queryRows<{ body: string; mentions: string[] }>(
      t.db,
      sql`select body, mentions from app.review_notes where item_id = ${id}::uuid`,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain('Possible scam ring');
    expect(notes[0]?.mentions).toEqual([freeOwner]);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.anything(),
      freeOwner,
      'operator.mention',
      { itemId: id },
    );
    expect(await auditActions(t.db, id)).toContain('trust.escalated');
  });

  it('escalates to a named operator', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const b = await addOperator(t.db, { queues: ['moderation'], shift: 'away' });
    const { id } = await open();

    await escalate(t.db, id, a, { toOperatorId: b, reason: 'Second opinion' });
    await escalate(t.db, id, b, { toOperatorId: a, reason: 'Back to you' });

    expect(await getItem(t.db, id)).toMatchObject({
      status: 'escalated',
      priority: 200,
      assignee_operator_id: a,
    });
    expect(await codeOf(escalate(t.db, id, a, { toOperatorId: b, reason: '  ' }))).toBe(
      'bad_request',
    );
  });
});

describe('appeals', () => {
  it('never routes an appeal to the operator who decided, while another is on shift', async () => {
    const a = await addOperator(t.db, { queues: ['moderation', 'appeals'] });
    const b = await addOperator(t.db, { queues: ['appeals'], shift: 'away' });
    const { id } = await open();
    await decide(t.db, id, a, 'remove');

    // B is busier than A, so plain least-loaded routing would pick A.
    await setShift(t.db, b, 'on_shift');
    await openReviewItem(t.db, {
      queue: 'appeals',
      subjectType: 'test_item',
      subjectId: newId(),
      reason: 'other appeal',
    });
    expect(await codeOf(openAppeal(t.db, { originalItemId: newId(), reason: 'x' }))).toBe(
      'not_found',
    );

    const appeal = await openAppeal(t.db, { originalItemId: id, reason: 'I did nothing wrong' });

    const item = await getItem(t.db, appeal.id);
    const original = await getItem(t.db, id);
    expect(item).toMatchObject({
      queue: 'appeals',
      original_item_id: id,
      subject_type: original.subject_type,
      subject_id: original.subject_id,
      assignee_operator_id: b,
    });
  });

  it('stays unassigned rather than go back to the decider when nobody else is on shift', async () => {
    const a = await addOperator(t.db, { role: 'owner' });
    const { id } = await open();
    await decide(t.db, id, a, 'remove');

    const appeal = await openAppeal(t.db, { originalItemId: id, reason: 'Please look again' });
    expect(await getItem(t.db, appeal.id)).toMatchObject({
      status: 'open',
      assignee_operator_id: null,
    });
  });

  it('keeps the original decider off the appeal while another operator could take it', async () => {
    const owner = await addOperator(t.db, { role: 'owner' });
    const b = await addOperator(t.db, { queues: ['appeals'], shift: 'away' });
    const { id } = await open();
    await decide(t.db, id, owner, 'remove');

    // Opened while B is away: it waits, unassigned.
    const appeal = await openAppeal(t.db, { originalItemId: id, reason: 'Please look again' });
    expect(await getItem(t.db, appeal.id)).toMatchObject({
      status: 'open',
      assignee_operator_id: null,
    });
    expect(await codeOf(claim(t.db, appeal.id, owner))).toBe('forbidden');
    expect(await codeOf(decide(t.db, appeal.id, owner, 'approve'))).toBe('forbidden');

    // Still not once B is on shift; B takes it.
    await setShift(t.db, b, 'on_shift');
    expect(await codeOf(claim(t.db, appeal.id, owner))).toBe('forbidden');
    await claim(t.db, appeal.id, b);

    // An Owner may act on any item, but not on the appeal of their own decision.
    expect(await codeOf(decide(t.db, appeal.id, owner, 'approve'))).toBe('forbidden');
    expect(await codeOf(handOff(t.db, appeal.id, b, owner))).toBe('bad_request');
    expect(
      await codeOf(escalate(t.db, appeal.id, b, { toOperatorId: owner, reason: 'Your call' })),
    ).toBe('bad_request');
    expect(await codeOf(escalate(t.db, appeal.id, b, { reason: 'Owner, please' }))).toBe(
      'conflict',
    );
    expect((await getItem(t.db, appeal.id)).assignee_operator_id).toBe(b);

    expect(await decide(t.db, appeal.id, b, 'approve')).toEqual({ status: 'applied' });
  });

  it('lets the original decider handle the appeal when nobody else could', async () => {
    const owner = await addOperator(t.db, { role: 'owner' });
    await addOperator(t.db, { queues: ['support'] });
    const { id } = await open('support');
    await decide(t.db, id, owner, 'remove');

    // Nobody else covers appeals.
    const appeal = await openAppeal(t.db, { originalItemId: id, reason: 'x' });
    await claim(t.db, appeal.id, owner);
    expect(await decide(t.db, appeal.id, owner, 'approve')).toEqual({ status: 'applied' });
  });

  it('keeps the original decider from signing off a decision on the appeal', async () => {
    const owner = await addOperator(t.db, { role: 'owner' });
    const b = await addOperator(t.db, { queues: ['appeals'], shift: 'away' });
    const c = await addOperator(t.db, { queues: ['support'], shift: 'away' });
    const { id } = await open();
    await decide(t.db, id, owner, 'remove');
    await setShift(t.db, b, 'on_shift');
    const appeal = await openAppeal(t.db, { originalItemId: id, reason: 'x' });
    expect((await getItem(t.db, appeal.id)).assignee_operator_id).toBe(b);

    expect(await decide(t.db, appeal.id, b, 'ban')).toEqual({ status: 'pending_second' });
    const [pending] = await actions(appeal.id);
    expect(await codeOf(approveSecond(t.db, pending?.id ?? '', owner))).toBe('forbidden');
    expect(await codeOf(rejectSecond(t.db, pending?.id ?? '', owner))).toBe('forbidden');

    await approveSecond(t.db, pending?.id ?? '', c);
    expect(await getItem(t.db, appeal.id)).toMatchObject({ status: 'resolved', decided_by: b });
  });

  it('only appeals a decided item, once at a time', async () => {
    const a = await addOperator(t.db, { role: 'owner' });
    const { id } = await open();
    expect(await codeOf(openAppeal(t.db, { originalItemId: id, reason: 'x' }))).toBe('conflict');

    await decide(t.db, id, a, 'remove');
    await openAppeal(t.db, { originalItemId: id, reason: 'x' });
    expect(await codeOf(openAppeal(t.db, { originalItemId: id, reason: 'y' }))).toBe('conflict');
  });
});

describe('addNote', () => {
  it('stores @mentions and notifies each mentioned operator once', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'], displayName: 'Al' });
    const b = await addOperator(t.db, { queues: ['moderation'], displayName: 'Bo' });
    const { id } = await open();

    await addNote(t.db, id, a, `@[Bo](${b}) check this`);

    const [note] = await queryRows<{
      body: string;
      mentions: string[];
      author_operator_id: string;
    }>(
      t.db,
      sql`select body, mentions, author_operator_id from app.review_notes where item_id = ${id}::uuid`,
    );
    expect(note).toEqual({ body: `@[Bo](${b}) check this`, mentions: [b], author_operator_id: a });
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(expect.anything(), b, 'operator.mention', {
      itemId: id,
    });
  });

  it('ignores mentions of non-operators, duplicates and the author', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const b = await addOperator(t.db, { queues: ['moderation'] });
    const { id } = await open();

    await addNote(
      t.db,
      id,
      a,
      `@[Bo](${b}) and again @[Bo](${b}), me @[Al](${a}), nobody @[X](${newId()})`,
    );

    const [note] = await queryRows<{ mentions: string[] }>(
      t.db,
      sql`select mentions from app.review_notes where item_id = ${id}::uuid`,
    );
    expect(note?.mentions).toEqual([b, a]);
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty note and a non-operator author', async () => {
    const a = await addOperator(t.db, { queues: ['moderation'] });
    const { id } = await open();
    expect(await codeOf(addNote(t.db, id, a, '   '))).toBe('bad_request');
    expect(await codeOf(addNote(t.db, id, newId(), 'hello'))).toBe('forbidden');
  });
});
