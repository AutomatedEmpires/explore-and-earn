import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  clerkIdHash,
  handleClerkEvent,
  isErasedClerkUser,
  makeFakeClerkAdmin,
  privacyHandler as identityHandler,
  type FakeClerkAdmin,
} from '@/modules/identity';
import { runWorker, type HandlerMap } from '@/modules/jobs';
import { stubEmailProvider, stubOutbox } from '@/modules/notifications';
import { privacyHandler as orgsHandler } from '@/modules/orgs';
import { decide } from '@/modules/trust';
import { buildPrivacyRegistry } from '@/server/privacy-registry';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedMember, seedOperator, seedSeeker } from '@tests/helpers/sp8';
// Loading the engine registers the dead-letter handlers and the privacy_request subject.
import './engine';
import {
  deactivateRequester,
  finalizeDeletion,
  replayErasure,
  requestDeletion,
  runEraseStep,
  type EraseDeps,
} from './erase';
import { setLegalHold } from './holds';
import './notification-types';
import type { EraseResult, PrivacyHandler, PrivacySubject } from './types';

const NOW = new Date('2026-11-18T12:00:00Z');
const HOUR = 60 * 60 * 1000;

let t: TestDb;
let clerk: FakeClerkAdmin;
/** Every fake erase call, in order: `<module>:<subject kind>`. */
let order: string[];
let fakeResult: (module: string, s: PrivacySubject) => EraseResult;

function fake(module: string): PrivacyHandler {
  return {
    module,
    tables: [],
    async exportData() {
      return { records: {}, files: [] };
    },
    async erase(_tx, s) {
      order.push(`${module}:${s.kind}`);
      return fakeResult(module, s);
    },
  };
}

// Four modules: two fakes (one of them the last wave) and the real orgs and identity erasers.
const registry = buildPrivacyRegistry([
  { handler: identityHandler, rules: [] },
  { handler: orgsHandler, rules: [] },
  { handler: fake('notes'), rules: [] },
  { handler: fake('media'), rules: [] },
]);
const deps = (): EraseDeps => ({
  registry,
  clerk,
  emailProvider: stubEmailProvider(),
  now: NOW,
});

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  // Steps an earlier test left queued must not run inside this one.
  await t.db.execute(sql`delete from app.outbox`);
  clerk = makeFakeClerkAdmin();
  order = [];
  fakeResult = () => ({ erased: 1, retained: [] });
  stubOutbox.length = 0;
});

const stepPayload = (p: unknown) => (p as { stepId: string }).stepId;
const requestPayload = (p: unknown) => (p as { requestId: string }).requestId;

/** The engine's jobs with this file's registry and fakes; every other topic is a no-op. */
async function handlers(): Promise<HandlerMap> {
  const topics = await queryRows<{ topic: string }>(t.db, sql`select distinct topic from app.outbox`);
  const map: HandlerMap = {};
  for (const { topic } of topics) map[topic] = async () => {};
  map['privacy.erase_step'] = (p, { db }) => runEraseStep(db, stepPayload(p), deps());
  map['privacy.erase_finalize'] = (p, { db }) => finalizeDeletion(db, requestPayload(p), deps());
  map['privacy.deactivate'] = (p, { db }) => deactivateRequester(db, requestPayload(p), deps());
  return map;
}

/** Runs the worker until nothing is left. Each pass is `stepMs` later, so backoff elapses. */
async function drain(o: { passes?: number; stepMs?: number } = {}): Promise<void> {
  for (let pass = 0; pass < (o.passes ?? 6); pass++) {
    const now = new Date(Date.now() + pass * (o.stepMs ?? 0));
    const result = await runWorker(t.db, {
      handlers: await handlers(),
      now,
      onDead: async () => {},
    });
    if (result.processed + result.retried + result.dead === 0 && (o.stepMs ?? 0) === 0) return;
  }
}

async function request(requestId: string) {
  const [row] = await queryRows<{
    status: string;
    blocked_reason: string | null;
    notify_email: string | null;
    clerk_user_id_pending: string | null;
    review_item_id: string | null;
  }>(
    t.db,
    sql`select status, blocked_reason, notify_email, clerk_user_id_pending, review_item_id::text
        from app.privacy_requests where id = ${requestId}`,
  );
  if (!row) throw new Error('request not found');
  return row;
}

const steps = (requestId: string) =>
  queryRows<{ module: string; subject_kind: string; phase: string; status: string }>(
    t.db,
    sql`select module, subject_kind, phase, status from app.privacy_request_steps
        where request_id = ${requestId} order by phase, subject_kind, module`,
  );

async function userRow(userId: string) {
  const [row] = await queryRows<{
    clerk_user_id: string;
    email: string | null;
    display_name: string | null;
    deleted_at: Date | null;
    erased_clerk_id_sha256: string | null;
  }>(
    t.db,
    sql`select clerk_user_id, email, display_name, deleted_at, erased_clerk_id_sha256
        from app.users where id = ${userId}`,
  );
  if (!row) throw new Error('user not found');
  return row;
}

const queued = (requestId: string) =>
  queryRows<{ topic: string; module: string | null }>(
    t.db,
    sql`select o.topic, s.module from app.outbox o
        left join app.privacy_request_steps s on s.id::text = o.payload->>'stepId'
        where o.payload->>'requestId' = ${requestId} or s.request_id = ${requestId}
        order by o.topic, s.module`,
  );

describe('requestDeletion', () => {
  it('asks an Owner with other members to transfer ownership first', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    await seedMember(t.db, org.orgId, 'admin');

    await expect(
      requestDeletion(t.db, clerk, org.owner.userId, deps()),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Transfer ownership of Kettle Ridge Lodge before deleting your account.',
      details: { reason: 'org_ownership', orgIds: [org.orgId] },
    });
    const rows = await queryRows(
      t.db,
      sql`select 1 from app.privacy_requests where user_id = ${org.owner.userId}`,
    );
    expect(rows).toEqual([]);
    const blocked = await queryRows<{ data: unknown }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'privacy.deletion_blocked' and actor_id = ${org.owner.userId}`,
    );
    expect(blocked).toEqual([{ data: { orgIds: [org.orgId] } }]);
    expect(clerk.banned.size).toBe(0);
  });

  it('refuses an operator account', async () => {
    const operator = await seedOperator(t.db);
    await expect(requestDeletion(t.db, clerk, operator.userId, deps())).rejects.toMatchObject({
      code: 'forbidden',
      details: { reason: 'operator_account' },
    });
  });

  it('plans a step per module and subject, queues the first wave and the email', async () => {
    const org = await seedHostOrg(t.db);
    const { requestId } = await requestDeletion(t.db, clerk, org.owner.userId, deps());

    // Two subjects (the person, the organization only they belong to) x three modules.
    expect(await steps(requestId)).toEqual([
      { module: 'media', subject_kind: 'org', phase: 'erase', status: 'pending' },
      { module: 'notes', subject_kind: 'org', phase: 'erase', status: 'pending' },
      { module: 'orgs', subject_kind: 'org', phase: 'erase', status: 'pending' },
      { module: 'media', subject_kind: 'user', phase: 'erase', status: 'pending' },
      { module: 'notes', subject_kind: 'user', phase: 'erase', status: 'pending' },
      { module: 'orgs', subject_kind: 'user', phase: 'erase', status: 'pending' },
      { module: 'identity', subject_kind: 'user', phase: 'finalize', status: 'pending' },
    ]);
    expect(await queued(requestId)).toEqual([
      { topic: 'privacy.deactivate', module: null },
      { topic: 'privacy.erase_step', module: 'notes' },
      { topic: 'privacy.erase_step', module: 'notes' },
      { topic: 'privacy.erase_step', module: 'orgs' },
      { topic: 'privacy.erase_step', module: 'orgs' },
    ]);

    const emails = await queryRows<{ payload: { to: string; data: { subject: string; lines: string[] } } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'notifications.email_direct'
          and dedupe_key like ${`%privacy_deletion_started:${requestId}`}`,
    );
    expect(emails).toHaveLength(1);
    expect(emails[0]?.payload.to).toBe(org.owner.email);
    expect(emails[0]?.payload.data.subject).toBe("We're deleting your Explore&Earn account");
    expect(emails[0]?.payload.data.lines).toEqual([
      "We've started deleting your account and data. You've been signed out.",
      "This can't be undone. We'll email you when it's finished, usually within a day.",
    ]);

    expect(await request(requestId)).toMatchObject({
      status: 'running',
      notify_email: org.owner.email,
    });
    expect(clerk.banned.has(org.owner.clerkUserId)).toBe(true);
    const audit = await queryRows<{ data: unknown }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'privacy.deletion_requested' and subject_id = ${requestId}`,
    );
    expect(audit).toEqual([{ data: { orgCount: 1 } }]);
  });

  it('answers a double click with one request, one set of steps and one email', async () => {
    const seeker = await seedSeeker(t.db);
    const [first, second] = await Promise.all([
      requestDeletion(t.db, clerk, seeker.userId, deps()),
      requestDeletion(t.db, clerk, seeker.userId, deps()),
    ]);
    expect(second.requestId).toBe(first.requestId);
    const third = await requestDeletion(t.db, clerk, seeker.userId, deps());
    expect(third.requestId).toBe(first.requestId);

    const requests = await queryRows(
      t.db,
      sql`select 1 from app.privacy_requests where user_id = ${seeker.userId}`,
    );
    expect(requests).toHaveLength(1);
    expect(await steps(first.requestId)).toHaveLength(4);
    const emails = await queryRows(
      t.db,
      sql`select 1 from app.outbox where topic = 'notifications.email_direct'
          and payload->>'to' = ${seeker.user.email}`,
    );
    expect(emails).toHaveLength(1);
    expect(clerk.calls.filter((call) => call.method === 'banUser')).toHaveLength(1);
  });

  it('still starts when Clerk cannot be reached, and the job deactivates later', async () => {
    const seeker = await seedSeeker(t.db);
    clerk.failNext('banUser');
    const { requestId } = await requestDeletion(t.db, clerk, seeker.userId, deps());
    expect(clerk.banned.size).toBe(0);
    await deactivateRequester(t.db, requestId, deps());
    expect(clerk.banned.has(seeker.user.clerkUserId)).toBe(true);
  });
});

describe('erasure in waves', () => {
  it('runs media last, then pseudonymizes, writes the ledger, deletes in Clerk and emails', async () => {
    const org = await seedHostOrg(t.db);
    const { userId, clerkUserId, email } = org.owner;
    const { requestId } = await requestDeletion(t.db, clerk, userId, deps());
    await drain();

    const firstMedia = order.findIndex((entry) => entry.startsWith('media:'));
    expect(order.slice(0, firstMedia).sort()).toEqual(['notes:org', 'notes:user']);
    expect(order.slice(firstMedia).sort()).toEqual(['media:org', 'media:user']);

    expect(await userRow(userId)).toMatchObject({
      clerk_user_id: `deleted:${userId}`,
      email: null,
      display_name: 'Deleted user',
      erased_clerk_id_sha256: clerkIdHash(clerkUserId),
    });
    expect((await userRow(userId)).deleted_at).not.toBeNull();
    const ledger = await queryRows<{ request_id: string }>(
      t.db,
      sql`select request_id::text from app.privacy_deletion_ledger where user_id = ${userId}`,
    );
    expect(ledger).toEqual([{ request_id: requestId }]);
    expect([...clerk.deleted]).toEqual([clerkUserId]);
    expect(await request(requestId)).toMatchObject({
      status: 'completed',
      notify_email: null,
      clerk_user_id_pending: null,
      blocked_reason: null,
    });
    expect((await steps(requestId)).every((step) => step.status === 'done')).toBe(true);

    expect(stubOutbox).toHaveLength(1);
    expect(stubOutbox[0]).toMatchObject({
      to: email,
      subject: 'Your Explore&Earn account is deleted',
      idempotencyKey: `privacy_deletion_completed:${requestId}`,
    });
    expect(stubOutbox[0]?.text).toContain('Your account and data are deleted.');
    expect(stubOutbox[0]?.text).not.toContain('legal obligation');

    // The organization only they belonged to is closed, and no membership row names them.
    const [closed] = await queryRows<{ deleted: boolean; owner_user_id: string | null }>(
      t.db,
      sql`select deleted_at is not null as deleted, owner_user_id::text
          from app.organizations where id = ${org.orgId}`,
    );
    expect(closed).toEqual({ deleted: true, owner_user_id: null });
    expect(
      await queryRows(t.db, sql`select 1 from app.org_memberships where user_id = ${userId}`),
    ).toEqual([]);

    const audit = await queryRows<{ data: { modules: number; retainedTables: string[] } }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'privacy.deletion_completed' and subject_id = ${requestId}`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.data.modules).toBe(4);
    expect(audit[0]?.data.retainedTables).toContain('users');
    const mirror = await queryRows(
      t.db,
      sql`select 1 from app.outbox where topic = 'privacy.ledger_mirror'`,
    );
    expect(mirror.length).toBeGreaterThan(0);
  });

  it('ignores Clerk events for the erased person afterwards (Review Focus 6)', async () => {
    const seeker = await seedSeeker(t.db);
    const clerkUserId = seeker.user.clerkUserId;
    await requestDeletion(t.db, clerk, seeker.userId, deps());
    await drain();
    expect(await isErasedClerkUser(t.db, clerkUserId)).toBe(true);

    const before = await queryRows<{ n: number }>(t.db, sql`select count(*)::int as n from app.users`);
    expect(
      await handleClerkEvent(t.db, {
        id: `msg_${newId()}`,
        type: 'user.deleted',
        data: { id: clerkUserId, deleted: true },
      }),
    ).toBe('ignored_erased');
    const after = await queryRows<{ n: number }>(t.db, sql`select count(*)::int as n from app.users`);
    expect(after).toEqual(before);
    expect(
      await queryRows(t.db, sql`select 1 from app.users where clerk_user_id = ${clerkUserId}`),
    ).toEqual([]);
  });

  it('says so in the last email when a module kept records under a legal hold', async () => {
    const seeker = await seedSeeker(t.db);
    fakeResult = (module) => ({
      erased: 0,
      retained:
        module === 'notes' ? [{ table: 'reports', reason: 'legal_hold', until: null }] : [],
    });
    await requestDeletion(t.db, clerk, seeker.userId, deps());
    await drain();
    expect(stubOutbox).toHaveLength(1);
    expect(stubOutbox[0]?.text).toContain('Some records are kept to meet a legal obligation.');
  });

  it('hands each module the holds, and a hold on everything keeps the record', async () => {
    const org = await seedHostOrg(t.db);
    const operator = await seedOperator(t.db, { role: 'owner' });
    await setLegalHold(
      t.db,
      {
        userId: org.owner.userId,
        scope: 'all',
        reason: 'Litigation hold 2026-44',
        reviewAt: '2027-01-01',
        operatorId: operator.userId,
      },
      NOW,
    );
    const { requestId } = await requestDeletion(t.db, clerk, org.owner.userId, deps());
    await drain();

    // The request finishes: a hold never blocks it. What is held is still there.
    expect((await request(requestId)).status).toBe('completed');
    const user = await userRow(org.owner.userId);
    expect(user.email).toBe(org.owner.email);
    expect(user.erased_clerk_id_sha256).toBe(clerkIdHash(org.owner.clerkUserId));
    expect(user.deleted_at).not.toBeNull();
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.org_memberships where user_id = ${org.owner.userId}`,
      ),
    ).toHaveLength(1);
    // The organization only they ran is covered by the hold on them.
    const [stillOpen] = await queryRows<{ deleted: boolean }>(
      t.db,
      sql`select deleted_at is not null as deleted from app.organizations where id = ${org.orgId}`,
    );
    expect(stillOpen).toEqual({ deleted: false });
    const held = await queryRows<{ module: string; retained: { reason: string }[] }>(
      t.db,
      sql`select module, retained from app.privacy_request_steps
          where request_id = ${requestId} and module in ('orgs', 'identity') order by module`,
    );
    for (const step of held) {
      expect(step.retained.length).toBeGreaterThan(0);
      expect(step.retained.every((r) => r.reason === 'legal_hold')).toBe(true);
    }
    expect(stubOutbox[0]?.text).toContain('Some records are kept to meet a legal obligation.');
  });

  it('keeps the Clerk id until Clerk confirms, and finishes on the retry', async () => {
    const seeker = await seedSeeker(t.db);
    const { requestId } = await requestDeletion(t.db, clerk, seeker.userId, deps());
    const pending = await queryRows<{ id: string }>(
      t.db,
      sql`select id::text from app.privacy_request_steps
          where request_id = ${requestId} and phase = 'erase' order by module desc`,
    );
    for (const step of pending) await runEraseStep(t.db, step.id, deps());

    clerk.failNext('deleteUser');
    await expect(finalizeDeletion(t.db, requestId, deps())).rejects.toThrow();
    expect(await request(requestId)).toMatchObject({
      status: 'completed',
      clerk_user_id_pending: seeker.user.clerkUserId,
      notify_email: seeker.user.email,
    });
    expect(stubOutbox).toHaveLength(0);

    await finalizeDeletion(t.db, requestId, deps());
    await finalizeDeletion(t.db, requestId, deps());
    expect([...clerk.deleted]).toEqual([seeker.user.clerkUserId]);
    expect(await request(requestId)).toMatchObject({
      clerk_user_id_pending: null,
      notify_email: null,
    });
    expect(stubOutbox).toHaveLength(1);
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.privacy_deletion_ledger where user_id = ${seeker.userId}`,
      ),
    ).toHaveLength(1);
  });

  it('refuses to finalize while an erase step is unfinished', async () => {
    const seeker = await seedSeeker(t.db);
    const { requestId } = await requestDeletion(t.db, clerk, seeker.userId, deps());
    await expect(finalizeDeletion(t.db, requestId, deps())).rejects.toThrow(/not finished/);
    expect((await userRow(seeker.userId)).email).toBe(seeker.user.email);
    expect((await request(requestId)).status).toBe('running');
  });
});

describe('a step that keeps failing', () => {
  it('reaches a person, tells the requester once, and completes after a retry', async () => {
    const operator = await seedOperator(t.db, { role: 'owner', queues: ['support'] });
    const seeker = await seedSeeker(t.db);
    fakeResult = (module) => {
      if (module === 'notes') throw new Error('notes eraser is broken');
      return { erased: 0, retained: [] };
    };
    const { requestId } = await requestDeletion(t.db, clerk, seeker.userId, deps());
    await drain({ passes: 9, stepMs: 8 * HOUR });

    const failed = await request(requestId);
    expect(failed).toMatchObject({ status: 'needs_action', blocked_reason: 'step_failed' });
    const failedSteps = await queryRows<{ module: string; last_error: string }>(
      t.db,
      sql`select module, last_error from app.privacy_request_steps
          where request_id = ${requestId} and status = 'failed'`,
    );
    expect(failedSteps).toEqual([{ module: 'notes', last_error: 'notes eraser is broken' }]);
    const items = await queryRows<{ id: string; queue: string; priority: number; reason: string }>(
      t.db,
      sql`select id::text, queue, priority, reason from app.review_items
          where subject_type = 'privacy_request' and subject_id = ${requestId}`,
    );
    expect(items).toEqual([
      {
        id: failed.review_item_id,
        queue: 'support',
        priority: 150,
        reason: 'Privacy request needs attention: delete, notes step failed',
      },
    ]);
    const delayed = await queryRows(
      t.db,
      sql`select 1 from app.notifications
          where user_id = ${seeker.userId} and type = 'privacy.request_delayed'`,
    );
    expect(delayed).toHaveLength(1);
    // Nothing after the failed wave ran.
    expect(order.some((entry) => entry.startsWith('media:'))).toBe(false);
    expect((await userRow(seeker.userId)).email).toBe(seeker.user.email);

    fakeResult = () => ({ erased: 0, retained: [] });
    await decide(t.db, failed.review_item_id ?? '', operator.userId, 'approve');
    await drain();

    expect(await request(requestId)).toMatchObject({ status: 'completed', blocked_reason: null });
    expect((await userRow(seeker.userId)).email).toBeNull();
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.notifications
            where user_id = ${seeker.userId} and type = 'privacy.request_delayed'`,
      ),
    ).toHaveLength(1);
  });
});

describe('replayErasure', () => {
  it('erases again in the same order with no Clerk call, email or mirror job', async () => {
    const org = await seedHostOrg(t.db);
    const requestId = newId();
    const mirrorBefore = await queryRows(
      t.db,
      sql`select 1 from app.outbox where topic = 'privacy.ledger_mirror'`,
    );

    const result = await replayErasure(
      t.db,
      { userId: org.owner.userId, requestId },
      { registry, now: NOW },
    );
    expect(result).toEqual({ modules: 4 });
    expect(order).toEqual(['notes:user', 'notes:org', 'media:user', 'media:org']);
    expect(await userRow(org.owner.userId)).toMatchObject({
      email: null,
      clerk_user_id: `deleted:${org.owner.userId}`,
    });
    const ledger = await queryRows<{ request_id: string }>(
      t.db,
      sql`select request_id::text from app.privacy_deletion_ledger
          where user_id = ${org.owner.userId}`,
    );
    expect(ledger).toEqual([{ request_id: requestId }]);
    expect(clerk.calls).toEqual([]);
    expect(stubOutbox).toHaveLength(0);
    expect(
      await queryRows(t.db, sql`select 1 from app.outbox where topic = 'privacy.ledger_mirror'`),
    ).toHaveLength(mirrorBefore.length);

    // Replaying twice is harmless.
    await replayErasure(t.db, { userId: org.owner.userId, requestId }, { registry, now: NOW });
    expect(
      await queryRows(
        t.db,
        sql`select 1 from app.privacy_deletion_ledger where user_id = ${org.owner.userId}`,
      ),
    ).toHaveLength(1);
  });
});
