import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows, withTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HoldScope, PrivacySubject } from '@/modules/privacy';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedLocation } from '@tests/helpers/sp2';
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

/** A site with a street address and a weather row, created by `createdBy`. */
async function seedSite(orgId: string, createdBy: string): Promise<string> {
  const id = await seedLocation(t.db, { orgId });
  await t.db.execute(sql`
    update app.locations
    set address_line1 = '12 Orchard Road', postal_code = '98801', created_by = ${createdBy}
    where id = ${id}
  `);
  await t.db.execute(sql`
    insert into app.location_weather (location_id, temperature_f) values (${id}, 61)
  `);
  return id;
}

async function site(id: string) {
  const [row] = await queryRows<{
    address_line1: string | null;
    postal_code: string | null;
    city: string;
    archived: boolean;
    created_by: string | null;
    weather: number;
  }>(
    t.db,
    sql`select l.address_line1, l.postal_code, l.city, l.archived_at is not null as archived,
          l.created_by::text,
          (select count(*)::int from app.location_weather w where w.location_id = l.id) as weather
        from app.locations l where l.id = ${id}`,
  );
  if (!row) throw new Error('location not found');
  return row;
}

describe('locations privacy handler', () => {
  it('forgets who created a location and leaves the location alone', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const mine = await seedSite(org.orgId, org.owner.userId);
    const theirs = await seedSite(other.orgId, other.owner.userId);
    const subject = { kind: 'user' as const, userId: org.owner.userId };

    expect(await erase(subject)).toEqual({ erased: 1, retained: [] });
    expect(await site(mine)).toMatchObject({
      created_by: null,
      address_line1: '12 Orchard Road',
      archived: false,
      weather: 1,
    });
    expect((await site(theirs)).created_by).toBe(other.owner.userId);
    expect(await erase(subject)).toEqual({ erased: 0, retained: [] });
    expect(await erase(subject, ['all'])).toEqual({ erased: 0, retained: [] });
  });

  it("archives a closing organization's sites without the street address", async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Untouched Outfitters' });
    const mine = await seedSite(org.orgId, org.owner.userId);
    const theirs = await seedSite(other.orgId, other.owner.userId);
    const subject = { kind: 'org' as const, orgId: org.orgId };

    const first = await erase(subject);
    expect(first).toEqual({
      erased: 2,
      retained: [{ table: 'locations', reason: 'shared_record', until: null }],
    });
    expect(await site(mine)).toMatchObject({
      address_line1: null,
      postal_code: null,
      city: 'Wenatchee',
      archived: true,
      weather: 0,
    });
    expect(await site(theirs)).toMatchObject({
      address_line1: '12 Orchard Road',
      postal_code: '98801',
      archived: false,
      weather: 1,
    });
    expect(await erase(subject)).toEqual({ erased: 0, retained: first.retained });
  });

  it('erases nothing under a hold on everything', async () => {
    const org = await seedHostOrg(t.db);
    const mine = await seedSite(org.orgId, org.owner.userId);
    expect(await erase({ kind: 'org', orgId: org.orgId }, ['all'])).toEqual({
      erased: 0,
      retained: [
        { table: 'locations', reason: 'legal_hold', until: null },
        { table: 'location_weather', reason: 'legal_hold', until: null },
      ],
    });
    expect(await erase({ kind: 'user', userId: org.owner.userId }, ['all'])).toEqual({
      erased: 0,
      retained: [{ table: 'locations', reason: 'legal_hold', until: null }],
    });
    expect(await site(mine)).toMatchObject({
      address_line1: '12 Orchard Road',
      archived: false,
      weather: 1,
      created_by: org.owner.userId,
    });
  });

  it('has nothing for an organization with no sites, and exports nothing', async () => {
    const org = await seedHostOrg(t.db);
    expect(await erase({ kind: 'org', orgId: org.orgId })).toEqual({ erased: 0, retained: [] });
    expect(
      await privacyHandler.exportData(t.db, { kind: 'user', userId: org.owner.userId }),
    ).toEqual({ records: {}, files: [] });
  });
});
