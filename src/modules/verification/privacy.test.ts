import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg } from '@tests/helpers/sp8';
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

async function seedCheck(orgId: string, createdAt: string): Promise<void> {
  await t.db.execute(sql`
    insert into app.business_verifications (id, org_id, status, decided_by, decided_at, created_at)
    values (${newId()}, ${orgId}, 'verified', 'auto', ${createdAt}::timestamptz,
      ${createdAt}::timestamptz)
  `);
}

const checks = async (orgId: string) =>
  (
    await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.business_verifications where org_id = ${orgId}`,
    )
  )[0]?.n;

describe('verification privacy handler', () => {
  it('claims the verification tables, the fraud list and the brand list', () => {
    expect(privacyHandler.tables).toEqual([
      'business_verifications',
      'verification_banned_fingerprints',
      'verification_brand_contacts',
    ]);
  });

  it('keeps how a business was checked for 12 months after the last check', async () => {
    const org = await seedHostOrg(t.db);
    const unchecked = await seedHostOrg(t.db, { name: 'Never Checked Ranch' });
    await seedCheck(org.orgId, '2025-12-01T09:00:00Z');
    await seedCheck(org.orgId, '2026-04-15T09:00:00Z');
    const subject = { kind: 'org' as const, orgId: org.orgId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 0,
      retained: [{ table: 'business_verifications', reason: 'safety', until: '2027-04-15' }],
    });
    expect(await erase(subject)).toEqual(first);
    expect(await checks(org.orgId)).toBe(2);
    expect(await erase(subject, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'business_verifications', reason: 'legal_hold', until: null }],
    });
    expect(await erase({ kind: 'org', orgId: unchecked.orgId })).toEqual({
      erased: 0,
      retained: [],
    });
  });

  it('has nothing for a person, and exports nothing', async () => {
    const org = await seedHostOrg(t.db);
    await seedCheck(org.orgId, '2026-04-15T09:00:00Z');
    const subject = { kind: 'user' as const, userId: org.owner.userId };
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
    expect(await erase(subject, ['all'])).toEqual({ erased: 0, retained: [] });
    expect(await privacyHandler.exportData(t.db, subject)).toEqual({ records: {}, files: [] });
  });
});
