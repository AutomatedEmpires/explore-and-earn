import { sql } from 'drizzle-orm';
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
  releaseLegalHold,
  setLegalHold,
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
