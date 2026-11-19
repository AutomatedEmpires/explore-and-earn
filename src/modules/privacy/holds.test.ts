import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOperator, seedSeeker } from '@tests/helpers/sp8';
import {
  activeHolds,
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

describe('namesUnderLegalHold', () => {
  async function held(condition: SQL): Promise<boolean> {
    const [row] = await queryRows<{ held: boolean }>(t.db, sql`select ${condition} as held`);
    return row?.held === true;
  }
  const payload = (value: Record<string, unknown>) => sql`${JSON.stringify(value)}::text`;

  it("finds a held person's id or address, in any case, or a held organization's id", async () => {
    const seeker = await seedSeeker(t.db);
    await hold({ userId: seeker.userId, scope: 'all' });
    const org = await seedHostOrg(t.db);
    await hold({ orgId: org.orgId, scope: 'messages' });
    const [user] = await queryRows<{ email: string }>(
      t.db,
      sql`select email from app.users where id = ${seeker.userId}`,
    );
    const email = user?.email ?? '';
    expect(email).toContain('@');

    expect(await held(namesUnderLegalHold(payload({ userId: seeker.userId }), 'all'))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ to: email.toUpperCase() }), 'all'))).toBe(true);
    // A hold on all covers every scope; a hold on messages covers only messages.
    expect(await held(namesUnderLegalHold(payload({ userId: seeker.userId }), 'billing'))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ orgId: org.orgId }), 'messages'))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ orgId: org.orgId }), 'all'))).toBe(false);
    expect(await held(namesUnderLegalHold(payload({ orgId: org.orgId }), 'any'))).toBe(true);
    expect(await held(namesUnderLegalHold(payload({ userId: newId(), to: 'a%b@x.test' }), 'any'))).toBe(
      false,
    );
  });
});
