import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator, seedSeeker } from '@tests/helpers/sp8';
import {
  activeHolds,
  applyMirroredHold,
  heldSubjects,
  holdsInclude,
  isOnLegalHold,
  listLegalHolds,
  namesUnderLegalHold,
  releaseLegalHold,
  setLegalHold,
  underLegalHold,
} from './holds';

const NOW = new Date('2026-11-18T12:00:00Z');
const REASON = 'Subpoena 26-1183 from the county court';

let t: TestDb;
let operatorId: string;

beforeAll(async () => {
  t = await createTestDb();
  operatorId = (await seedOperator(t.db, { role: 'owner' })).userId;
});

afterAll(async () => {
  await t.close();
});

const hold = (over: Partial<Parameters<typeof setLegalHold>[1]>) =>
  setLegalHold(
    t.db,
    { scope: 'reports', reason: REASON, reviewAt: '2026-12-18', operatorId, ...over },
    NOW,
  );

describe('setLegalHold', () => {
  it('refuses a hold that names both, neither, a short reason or a past review date', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const orgId = (await seedHostOrg(t.db)).orgId;
    await expect(hold({ userId, orgId })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(hold({})).rejects.toMatchObject({ code: 'bad_request' });
    await expect(hold({ userId, reason: '123456789' })).rejects.toMatchObject({
      code: 'bad_request',
    });
    await expect(hold({ userId, reviewAt: '2026-11-17' })).rejects.toMatchObject({
      code: 'bad_request',
    });
    await expect(hold({ userId, reviewAt: '2026-02-30' })).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual([]);
  });

  it('stores the hold and audits it without the reason', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId, reviewAt: '2026-11-18' });

    const rows = await queryRows<{ scope: string; reason: string; review_at: string }>(
      t.db,
      sql`select scope, reason, review_at::text from app.privacy_legal_holds where id = ${holdId}`,
    );
    expect(rows).toEqual([{ scope: 'reports', reason: REASON, review_at: '2026-11-18' }]);

    const audit = await queryRows<{ data: Record<string, unknown>; actor_id: string }>(
      t.db,
      sql`select data, actor_id::text from app.audit_events
          where action = 'privacy.legal_hold_set' and subject_id = ${userId}`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_id).toBe(operatorId);
    expect(audit[0]?.data).toEqual({
      holdId,
      scope: 'reports',
      reviewAt: '2026-11-18',
      subjectKind: 'user',
    });
    expect(audit[0]?.data).not.toHaveProperty('reason');
  });
});

describe('active holds', () => {
  it('lists the held scopes until every hold is released, and releases only once', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const first = await hold({ userId });
    const second = await hold({ userId });
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual(['reports']);

    await releaseLegalHold(t.db, { holdId: first.holdId, operatorId }, NOW);
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual(['reports']);
    await releaseLegalHold(t.db, { holdId: second.holdId, operatorId }, NOW);
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual([]);

    await expect(
      releaseLegalHold(t.db, { holdId: first.holdId, operatorId }, NOW),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      releaseLegalHold(t.db, { holdId: newId(), operatorId }, NOW),
    ).rejects.toMatchObject({ code: 'not_found' });
    const released = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.audit_events
          where action = 'privacy.legal_hold_released' and subject_id = ${userId}`,
    );
    expect(released[0]?.n).toBe(2);
  });

  it('matches a scope directly or through a hold on everything, per subject', async () => {
    const all = (await seedSeeker(t.db)).userId;
    const reportsOnly = (await seedSeeker(t.db)).userId;
    const bystander = (await seedSeeker(t.db)).userId;
    const org = await seedHostOrg(t.db);
    await hold({ userId: all, scope: 'all' });
    await hold({ userId: reportsOnly, scope: 'reports' });
    await hold({ orgId: org.orgId, scope: 'all' });

    expect(await isOnLegalHold(t.db, { userId: all, scope: 'billing' })).toBe(true);
    expect(await isOnLegalHold(t.db, { userId: reportsOnly, scope: 'billing' })).toBe(false);
    expect(await isOnLegalHold(t.db, { userId: reportsOnly, scope: 'reports' })).toBe(true);
    // An organization's hold is not its Owner's, nor anybody else's.
    expect(await isOnLegalHold(t.db, { userId: org.owner.userId, scope: 'billing' })).toBe(false);
    expect(await isOnLegalHold(t.db, { userId: bystander, scope: 'all' })).toBe(false);
    expect(await isOnLegalHold(t.db, { orgId: org.orgId, scope: 'messages' })).toBe(true);
    expect(await isOnLegalHold(t.db, { scope: 'all' })).toBe(false);

    expect(holdsInclude(['reports'], 'reports')).toBe(true);
    expect(holdsInclude(['all'], 'messages')).toBe(true);
    expect(holdsInclude(['reports'], 'billing')).toBe(false);
  });

  it('lists holds newest first and hides released ones unless asked', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId, scope: 'messages' });
    const open = await listLegalHolds(t.db);
    expect(open.items[0]).toMatchObject({
      id: holdId,
      userId,
      orgId: null,
      scope: 'messages',
      reason: REASON,
    });

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);
    expect((await listLegalHolds(t.db)).items.map((h) => h.id)).not.toContain(holdId);
    const everything = await listLegalHolds(t.db, { includeReleased: true });
    expect(everything.items.find((h) => h.id === holdId)?.releasedAt).toEqual(NOW);
    expect(everything.nextBefore).toBeNull();
    const older = await listLegalHolds(t.db, { includeReleased: true, before: holdId });
    expect(older.items.map((h) => h.id)).not.toContain(holdId);
  });
});

describe('underLegalHold', () => {
  type Held = { held: boolean };

  async function held(condition: SQL): Promise<boolean> {
    const [row] = await queryRows<Held>(t.db, sql`select ${condition} as held`);
    return row?.held === true;
  }

  it('matches the scope itself or a hold on everything, like holdsInclude, and any scope with any', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    await hold({ userId, scope: 'messages' });
    const user = [sql`${userId}::uuid`];

    expect(await held(underLegalHold({ users: user, scope: 'messages' }))).toBe(true);
    expect(await held(underLegalHold({ users: user, scope: 'applications' }))).toBe(false);
    expect(await held(underLegalHold({ users: user, scope: 'all' }))).toBe(false);
    expect(await held(underLegalHold({ users: user, scope: 'any' }))).toBe(true);

    const everything = (await seedSeeker(t.db)).userId;
    await hold({ userId: everything, scope: 'all' });
    for (const scope of ['all', 'applications', 'messages', 'reports', 'billing', 'any'] as const) {
      expect(await held(underLegalHold({ users: [sql`${everything}::uuid`], scope }))).toBe(true);
    }
  });

  it('matches an organization by its own holds only, takes text ids, and ignores null ids', async () => {
    const org = await seedHostOrg(t.db);
    await hold({ orgId: org.orgId, scope: 'reports' });
    const owner = org.owner.userId;

    expect(await held(underLegalHold({ orgs: [sql`${org.orgId}::text`], scope: 'reports' }))).toBe(true);
    expect(await held(underLegalHold({ users: [sql`${org.orgId}::uuid`], scope: 'any' }))).toBe(false);
    expect(await held(underLegalHold({ users: [sql`${owner}::uuid`], scope: 'any' }))).toBe(false);
    expect(
      await held(
        underLegalHold({ users: [sql`null::uuid`, sql`${owner}::uuid`], orgs: [sql`${org.orgId}::uuid`], scope: 'any' }),
      ),
    ).toBe(true);
    expect(await held(underLegalHold({ users: [sql`null::uuid`], orgs: [sql`null`], scope: 'any' }))).toBe(false);
  });

  it('stops counting a hold once it is released', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId, scope: 'all' });
    const condition = underLegalHold({ users: [sql`${userId}::uuid`], scope: 'any' });
    expect(await held(condition)).toBe(true);

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);

    expect(await held(condition)).toBe(false);
  });

  it('refuses a condition that names no one', () => {
    expect(() => underLegalHold({ scope: 'any' })).toThrow(/name the user or organization/);
  });
});

describe('namesUnderLegalHold and heldSubjects', () => {
  async function held(condition: SQL): Promise<boolean> {
    const [row] = await queryRows<{ held: boolean }>(t.db, sql`select ${condition} as held`);
    return row?.held === true;
  }
  const payload = (value: Record<string, unknown>) => sql`${JSON.stringify(value)}::text`;

  it("finds a held id in the text, or one of the held people's addresses in any case", async () => {
    const seeker = await seedSeeker(t.db);
    await hold({ userId: seeker.userId, scope: 'all' });
    const org = await seedHostOrg(t.db);
    await hold({ orgId: org.orgId, scope: 'messages' });

    expect(await held(namesUnderLegalHold(payload({ userId: seeker.userId }), 'all'))).toBe(true);
    // A hold on all covers every scope; a hold on messages covers only messages.
    expect(await held(namesUnderLegalHold(payload({ userId: seeker.userId }), 'billing'))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ orgId: org.orgId }), 'messages'))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ orgId: org.orgId }), 'all'))).toBe(false);
    expect(await held(namesUnderLegalHold(payload({ orgId: org.orgId }), 'any'))).toBe(true);
    // Addresses are the caller's (read from identity), matched literally and in any case.
    const to = payload({ to: 'Maya.Held@Example.test' });
    expect(await held(namesUnderLegalHold(to, 'all'))).toBe(false);
    expect(await held(namesUnderLegalHold(to, 'all', [' maya.held@example.test ']))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ to: 'mayaXheld@example.test' }), 'all', ['maya.held@example.test']))).toBe(false);
    expect(await held(namesUnderLegalHold(payload({ userId: newId() }), 'any', ['', '  ']))).toBe(false);
  });

  it('heldSubjects lists the people and organizations whose open holds cover the scope', async () => {
    const seeker = (await seedSeeker(t.db)).userId;
    await hold({ userId: seeker, scope: 'billing' });
    const org = (await seedHostOrg(t.db)).orgId;
    const { holdId } = await hold({ orgId: org, scope: 'all' });

    const billing = await heldSubjects(t.db, 'billing');
    expect(billing.users.has(seeker)).toBe(true);
    expect(billing.orgs.has(org)).toBe(true);
    const reports = await heldSubjects(t.db, 'reports');
    expect(reports.users.has(seeker)).toBe(false);
    expect(reports.orgs.has(org)).toBe(true);

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);
    expect((await heldSubjects(t.db, 'any')).orgs.has(org)).toBe(false);
  });
});

type Kept = { table: string; reason: string; until: null }[];
const HELD: Kept = [{ table: 'reports', reason: 'legal_hold', until: null }];

/** A deletion request of `userId` with one erase step for `subject` that kept `retained`. */
async function seedDeletion(
  userId: string,
  o: {
    status: 'running' | 'completed' | 'failed';
    retained: Kept;
    subject?: { kind: 'user' | 'org'; id: string };
  },
): Promise<string> {
  const requestId = newId();
  const subject = o.subject ?? { kind: 'user' as const, id: userId };
  await t.db.execute(sql`
    insert into app.privacy_requests (id, user_id, kind, status)
    values (${requestId}, ${userId}, 'delete', ${o.status})
  `);
  await t.db.execute(sql`
    insert into app.privacy_request_steps
      (id, request_id, subject_kind, subject_id, module, phase, status, retained)
    values (${newId()}, ${requestId}, ${subject.kind}, ${subject.id}, 'notes', 'erase', 'done',
      ${JSON.stringify(o.retained)}::jsonb)
  `);
  return requestId;
}

const reErasures = async (requestId: string) =>
  (
    await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox
          where topic = 'privacy.hold_release_erase' and payload->>'requestId' = ${requestId}`,
    )
  )[0]?.n ?? 0;

const mirrorJobs = async (holdId: string) =>
  (
    await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox
          where topic = 'privacy.hold_mirror' and payload->>'holdId' = ${holdId}`,
    )
  )[0]?.n ?? 0;

describe('releasing a hold (issue 232)', () => {
  it('queues a re-erasure of the finished deletion that kept records under a hold', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId });
    const requestId = await seedDeletion(userId, { status: 'completed', retained: HELD });
    expect(await reErasures(requestId)).toBe(0);

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);

    expect(await reErasures(requestId)).toBe(1);
  });

  it('queues it for the deletion that kept an organization the hold names', async () => {
    const org = await seedHostOrg(t.db);
    const { holdId } = await hold({ orgId: org.orgId, scope: 'all' });
    const requestId = await seedDeletion(org.owner.userId, {
      status: 'completed',
      retained: HELD,
      subject: { kind: 'org', id: org.orgId },
    });
    const unrelated = await seedDeletion((await seedSeeker(t.db)).userId, {
      status: 'completed',
      retained: HELD,
    });

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);

    expect(await reErasures(requestId)).toBe(1);
    expect(await reErasures(unrelated)).toBe(0);
  });

  it('queues nothing when the deletion kept nothing under a hold, or failed', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId });
    const nothingHeld = await seedDeletion(userId, {
      status: 'completed',
      retained: [{ table: 'reports', reason: 'safety', until: null }],
    });
    const failed = await seedDeletion(userId, { status: 'failed', retained: HELD });

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);

    expect(await reErasures(nothingHeld)).toBe(0);
    expect(await reErasures(failed)).toBe(0);
  });

  it('leaves a deletion that is still running to its finalize step', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId });
    const running = await seedDeletion(userId, { status: 'running', retained: HELD });

    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);

    expect(await reErasures(running)).toBe(0);
  });
});

describe('the hold mirror (issue 232)', () => {
  it('queues a copy to the mirror when a hold is set and again when it is released', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId });
    expect(await mirrorJobs(holdId)).toBe(1);
    await releaseLegalHold(t.db, { holdId, operatorId }, NOW);
    expect(await mirrorJobs(holdId)).toBe(2);
  });

  const mirrored = (over: Partial<Parameters<typeof applyMirroredHold>[1]> = {}) => ({
    holdId: newId(),
    userId: null,
    orgId: null,
    scope: 'messages' as const,
    reviewAt: '2026-12-18',
    createdBy: operatorId,
    createdAt: '2026-11-18T10:00:00.000Z',
    releasedAt: null,
    releasedBy: null,
    ...over,
  });

  it('puts back a hold the restored database lacks, and only says so in a dry run', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const entry = mirrored({ userId });

    expect(await applyMirroredHold(t.db, entry, { apply: false })).toBe('added');
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual([]);

    expect(await applyMirroredHold(t.db, entry, { apply: true })).toBe('added');
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual(['messages']);
    const rows = await queryRows<{ review_at: string; created_by: string; created_at: Date }>(
      t.db,
      sql`select review_at::text, created_by::text, created_at
          from app.privacy_legal_holds where id = ${entry.holdId}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.review_at).toBe('2026-12-18');
    expect(rows[0]?.created_by).toBe(operatorId);
    expect(new Date(rows[0]?.created_at ?? 0).toISOString()).toBe(entry.createdAt);
    const audit = await queryRows<{ data: Record<string, unknown> }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'privacy.legal_hold_restored' and subject_id = ${userId}`,
    );
    expect(audit).toEqual([{ data: { holdId: entry.holdId, scope: 'messages', subjectKind: 'user' } }]);

    expect(await applyMirroredHold(t.db, entry, { apply: true })).toBe('unchanged');
  });

  it('releases a hold the mirror shows released, and queues the re-erasure', async () => {
    const userId = (await seedSeeker(t.db)).userId;
    const { holdId } = await hold({ userId });
    const requestId = await seedDeletion(userId, { status: 'completed', retained: HELD });
    const entry = mirrored({
      holdId,
      userId,
      scope: 'reports',
      releasedAt: '2026-11-18T11:00:00.000Z',
      releasedBy: operatorId,
    });

    expect(await applyMirroredHold(t.db, entry, { apply: false })).toBe('released');
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual(['reports']);

    expect(await applyMirroredHold(t.db, entry, { apply: true })).toBe('released');
    expect(await activeHolds(t.db, { kind: 'user', userId })).toEqual([]);
    expect(await reErasures(requestId)).toBe(1);
    expect(await applyMirroredHold(t.db, entry, { apply: true })).toBe('unchanged');
  });

  it('records an Owner when the operator who placed the hold is not in the database', async () => {
    const orgId = (await seedHostOrg(t.db)).orgId;
    const entry = mirrored({ orgId, createdBy: newId() });

    expect(await applyMirroredHold(t.db, entry, { apply: true })).toBe('added');

    const [row] = await queryRows<{ role: string }>(
      t.db,
      sql`select o.role from app.privacy_legal_holds h
          join app.operators o on o.user_id = h.created_by where h.id = ${entry.holdId}`,
    );
    expect(row).toEqual({ role: 'owner' });
    expect(await activeHolds(t.db, { kind: 'org', orgId })).toEqual(['messages']);
  });

  it('refuses an entry that names both or neither', async () => {
    await expect(applyMirroredHold(t.db, mirrored(), { apply: true })).rejects.toThrow(
      /one user or one organization/,
    );
  });
});
