import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedMember } from '@tests/helpers/sp8';
import { privacyHandler } from './privacy';

const NOW = new Date('2026-11-18T12:00:00Z');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const erase = (s: PrivacySubject, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) => privacyHandler.erase(tx, s, { requestId: newId(), now: NOW, holds }));

/** A grant and a consumption of it, both created by `userId` on `createdAt`. */
async function seedLedger(orgId: string, userId: string, createdAt: string) {
  const grantId = newId();
  const consumptionId = newId();
  await t.db.execute(sql`
    insert into app.entitlement_grants
      (id, org_id, kind, quantity, source, source_ref, idempotency_key, created_by, created_at)
    values (${grantId}, ${orgId}, 'invite_credit', 5, 'operator', 'test', ${`g:${grantId}`},
      ${userId}, ${createdAt}::timestamptz)
  `);
  await t.db.execute(sql`
    insert into app.entitlement_consumptions
      (id, org_id, grant_id, kind, quantity, subject_type, subject_id, idempotency_key,
       created_by, created_at)
    values (${consumptionId}, ${orgId}, ${grantId}, 'invite_credit', 1, 'invite', 'x',
      ${`c:${consumptionId}`}, ${userId}, ${createdAt}::timestamptz)
  `);
  return { grantId, consumptionId };
}

const creators = async (ids: { grantId: string; consumptionId: string }) => {
  const [grant] = await queryRows<{ created_by: string | null; quantity: number }>(
    t.db,
    sql`select created_by::text, quantity from app.entitlement_grants where id = ${ids.grantId}`,
  );
  const [consumption] = await queryRows<{ created_by: string | null }>(
    t.db,
    sql`select created_by::text from app.entitlement_consumptions where id = ${ids.consumptionId}`,
  );
  return [grant?.created_by ?? null, consumption?.created_by ?? null, grant?.quantity];
};

describe('entitlements privacy handler', () => {
  it('forgets who created the rows and keeps the ledger', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const mine = await seedLedger(org.orgId, admin.userId, '2026-05-01T00:00:00Z');
    const theirs = await seedLedger(org.orgId, org.owner.userId, '2026-05-02T00:00:00Z');
    const subject = { kind: 'user' as const, userId: admin.userId };

    expect(await erase(subject)).toEqual({ erased: 2, retained: [] });
    expect(await creators(mine)).toEqual([null, null, 5]);
    expect(await creators(theirs)).toEqual([org.owner.userId, org.owner.userId, 5]);
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
  });

  it('keeps the links under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const rows = await seedLedger(org.orgId, org.owner.userId, '2026-05-01T00:00:00Z');
    expect(await erase({ kind: 'user', userId: org.owner.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [
        { table: 'entitlement_grants', reason: 'legal_hold', until: null },
        { table: 'entitlement_consumptions', reason: 'legal_hold', until: null },
      ],
    });
    expect(await creators(rows)).toEqual([org.owner.userId, org.owner.userId, 5]);
  });

  it("keeps an organization's ledger 7 years past its newest row", async () => {
    const org = await seedHostOrg(t.db);
    const empty = await seedHostOrg(t.db, { name: 'No Ledger Lodge' });
    await seedLedger(org.orgId, org.owner.userId, '2025-03-01T00:00:00Z');
    const rows = await seedLedger(org.orgId, org.owner.userId, '2026-05-01T00:00:00Z');
    const subject = { kind: 'org' as const, orgId: org.orgId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 0,
      retained: [
        { table: 'entitlement_grants', reason: 'legal_obligation', until: '2033-05-01' },
        { table: 'entitlement_consumptions', reason: 'legal_obligation', until: '2033-05-01' },
      ],
    });
    expect(await erase(subject)).toEqual(first);
    expect(await creators(rows)).toEqual([org.owner.userId, org.owner.userId, 5]);
    expect((await erase(subject, ['all'])).retained).toEqual([
      { table: 'entitlement_grants', reason: 'legal_hold', until: null },
      { table: 'entitlement_consumptions', reason: 'legal_hold', until: null },
    ]);
    expect(await erase({ kind: 'org', orgId: empty.orgId })).toEqual({ erased: 0, retained: [] });
  });

  it('exports nothing: the ledger is the organization record', async () => {
    const org = await seedHostOrg(t.db);
    await seedLedger(org.orgId, org.owner.userId, '2026-05-01T00:00:00Z');
    expect(
      await privacyHandler.exportData(t.db, { kind: 'user', userId: org.owner.userId }),
    ).toEqual({ records: {}, files: [] });
  });
});
