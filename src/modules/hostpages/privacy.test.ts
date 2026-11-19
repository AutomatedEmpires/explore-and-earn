import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';
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

async function seedPage(orgId: string, updatedBy: string): Promise<void> {
  await t.db.execute(sql`
    insert into app.host_pages (org_id, content, updated_by)
    values (${orgId}, '{"about":"A lodge by the river"}'::jsonb, ${updatedBy})
  `);
}

async function follow(userId: string, orgId: string): Promise<void> {
  await t.db.execute(sql`insert into app.host_follows (user_id, org_id) values (${userId}, ${orgId})`);
}

const page = async (orgId: string) =>
  (
    await queryRows<{ updated_by: string | null }>(
      t.db,
      sql`select updated_by::text from app.host_pages where org_id = ${orgId}`,
    )
  )[0];

const followers = async (orgId: string) =>
  (
    await queryRows<{ user_id: string }>(
      t.db,
      sql`select user_id::text from app.host_follows where org_id = ${orgId} order by user_id`,
    )
  ).map((row) => row.user_id);

describe('hostpages privacy handler', () => {
  it("deletes a person's follows and their name on a page they edited", async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await seedPage(org.orgId, org.owner.userId);
    await follow(seeker.userId, org.orgId);
    await follow(other.userId, org.orgId);

    expect(await erase({ kind: 'user', userId: seeker.userId })).toEqual({
      erased: 1,
      retained: [],
    });
    expect(await followers(org.orgId)).toEqual([other.userId]);
    expect(await page(org.orgId)).toEqual({ updated_by: org.owner.userId });

    const owner = { kind: 'user' as const, userId: org.owner.userId };
    expect(await erase(owner)).toEqual({ erased: 1, retained: [] });
    expect(await page(org.orgId)).toEqual({ updated_by: null });
    expect(await erase(owner)).toEqual({ erased: 0, retained: [] });
  });

  it("removes a closing organization's page and its followers", async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const a = await seedSeeker(t.db);
    const b = await seedSeeker(t.db);
    await seedPage(org.orgId, org.owner.userId);
    await seedPage(other.orgId, other.owner.userId);
    await follow(a.userId, org.orgId);
    await follow(b.userId, org.orgId);
    await follow(a.userId, other.orgId);
    const subject = { kind: 'org' as const, orgId: org.orgId };

    expect(await erase(subject)).toEqual({ erased: 3, retained: [] });
    expect(await page(org.orgId)).toBeUndefined();
    expect(await followers(org.orgId)).toEqual([]);
    expect(await page(other.orgId)).toEqual({ updated_by: other.owner.userId });
    expect(await followers(other.orgId)).toEqual([a.userId]);
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
  });

  it('erases nothing under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    await seedPage(org.orgId, org.owner.userId);
    await follow(seeker.userId, org.orgId);
    expect(await erase({ kind: 'org', orgId: org.orgId }, ['all'])).toEqual({
      erased: 0,
      retained: [
        { table: 'host_pages', reason: 'legal_hold', until: null },
        { table: 'host_follows', reason: 'legal_hold', until: null },
      ],
    });
    expect(await erase({ kind: 'user', userId: seeker.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'host_follows', reason: 'legal_hold', until: null }],
    });
    expect(await page(org.orgId)).toEqual({ updated_by: org.owner.userId });
    expect(await followers(org.orgId)).toEqual([seeker.userId]);
  });

  it('exports the hosts a person follows, by name', async () => {
    const org = await seedHostOrg(t.db, { name: 'Cedar Point Camp' });
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await follow(seeker.userId, org.orgId);
    await follow(other.userId, org.orgId);
    const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: seeker.userId });
    expect(part.records.follows).toEqual([
      { orgName: 'Cedar Point Camp', followedAt: expect.any(Date) as Date },
    ]);
    expect(part.files).toEqual([]);
  });
});
