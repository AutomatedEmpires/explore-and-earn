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

async function seedChange(orgId: string, requestedBy: string): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.billing_changes (id, org_id, to_plan, to_interval, to_extra_slots, status,
      requested_by)
    values (${id}, ${orgId}, 'professional', 'month', 0, 'applied', ${requestedBy})
  `);
  return id;
}

async function seedSubscription(orgId: string): Promise<void> {
  await t.db.execute(sql`
    insert into app.billing_accounts (org_id, stripe_customer_id)
    values (${orgId}, ${`cus_${newId()}`})
  `);
  await t.db.execute(sql`
    insert into app.subscriptions (id, org_id, stripe_subscription_id, status, plan, interval)
    values (${newId()}, ${orgId}, ${`sub_${newId()}`}, 'active', 'starter', 'month')
  `);
}

const requestedBy = async (id: string) =>
  (
    await queryRows<{ requested_by: string | null }>(
      t.db,
      sql`select requested_by::text from app.billing_changes where id = ${id}`,
    )
  )[0]?.requested_by ?? null;

const cancelJobs = (orgId: string) =>
  queryRows<{ topic: string; payload: unknown }>(
    t.db,
    sql`select topic, payload from app.outbox where dedupe_key = ${`cancel:${orgId}:close`}`,
  );

const rowCount = async (orgId: string) =>
  (
    await queryRows<{ n: number }>(
      t.db,
      sql`select (select count(*) from app.subscriptions where org_id = ${orgId})::int
            + (select count(*) from app.billing_accounts where org_id = ${orgId})::int
            + (select count(*) from app.billing_changes where org_id = ${orgId})::int as n`,
    )
  )[0]?.n;

describe('billing privacy handler', () => {
  it('forgets who asked for a plan change, and nothing else', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    const mine = await seedChange(org.orgId, admin.userId);
    const theirs = await seedChange(org.orgId, org.owner.userId);
    const subject = { kind: 'user' as const, userId: admin.userId };

    expect(await erase(subject)).toEqual({ erased: 1, retained: [] });
    expect(await requestedBy(mine)).toBeNull();
    expect(await requestedBy(theirs)).toBe(org.owner.userId);
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
  });

  it('keeps the link under a hold on everything or on billing', async () => {
    const org = await seedHostOrg(t.db);
    const change = await seedChange(org.orgId, org.owner.userId);
    const subject = { kind: 'user' as const, userId: org.owner.userId };
    const kept = {
      erased: 0,
      retained: [{ table: 'billing_changes', reason: 'legal_hold', until: null }],
    };
    expect(await erase(subject, ['all'])).toEqual(kept);
    expect(await erase(subject, ['billing'])).toEqual(kept);
    expect(await requestedBy(change)).toBe(org.owner.userId);
  });

  it('cancels a closing organization once and keeps its records 7 years', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    await seedSubscription(org.orgId);
    await seedChange(org.orgId, org.owner.userId);
    await seedSubscription(other.orgId);
    const before = await rowCount(org.orgId);
    const subject = { kind: 'org' as const, orgId: org.orgId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 0,
      retained: [
        { table: 'billing_accounts', reason: 'legal_obligation', until: '2033-11-18' },
        { table: 'subscriptions', reason: 'legal_obligation', until: '2033-11-18' },
        { table: 'billing_changes', reason: 'legal_obligation', until: '2033-11-18' },
      ],
    });
    expect(await cancelJobs(org.orgId)).toEqual([
      { topic: 'billing.cancel_subscription', payload: { orgId: org.orgId } },
    ]);
    expect(await erase(subject)).toEqual(first);
    expect(await cancelJobs(org.orgId)).toHaveLength(1);
    expect(await rowCount(org.orgId)).toBe(before);
    expect(await cancelJobs(other.orgId)).toEqual([]);
  });

  it('reports a legal hold under a billing hold, and still stops charging', async () => {
    const org = await seedHostOrg(t.db);
    await seedSubscription(org.orgId);
    const held = await erase({ kind: 'org', orgId: org.orgId }, ['billing']);
    expect(held).toEqual({
      erased: 0,
      retained: [
        { table: 'billing_accounts', reason: 'legal_hold', until: null },
        { table: 'subscriptions', reason: 'legal_hold', until: null },
      ],
    });
    expect(await cancelJobs(org.orgId)).toHaveLength(1);
  });

  it('leaves the subscription running under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    await seedSubscription(org.orgId);
    const held = await erase({ kind: 'org', orgId: org.orgId }, ['all']);
    expect(held.erased).toBe(0);
    expect(held.retained.every((r) => r.reason === 'legal_hold')).toBe(true);
    expect(await cancelJobs(org.orgId)).toEqual([]);
  });

  it('exports nothing: billing belongs to the organization', async () => {
    const org = await seedHostOrg(t.db);
    await seedChange(org.orgId, org.owner.userId);
    expect(
      await privacyHandler.exportData(t.db, { kind: 'user', userId: org.owner.userId }),
    ).toEqual({ records: {}, files: [] });
  });
});
