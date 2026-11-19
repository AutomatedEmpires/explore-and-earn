// listingRevisionOwners (#216): the batch owner lookup another module's retention rule uses to
// keep what a legal hold covers, without naming listings' tables in raw SQL.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedMember } from '@tests/helpers/sp2';
import { listingRevisionOwners } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

/** A listing created by `createdBy` with one revision submitted by `submittedBy`. */
async function seedRevision(
  orgId: string,
  people: { createdBy?: string | null; submittedBy?: string | null } = {},
): Promise<string> {
  const listingId = newId();
  const revisionId = newId();
  await t.db.execute(sql`
    insert into app.listings (id, org_id, created_by)
    values (${listingId}, ${orgId}, ${people.createdBy ?? null})
  `);
  await t.db.execute(sql`
    insert into app.listing_revisions (
      id, listing_id, org_id, revision_number, status, content, title, primary_category, genre,
      occupation_code, employment_type, schedule, openings, date_mode, weekly_hours, pay_kind,
      pay_min_cents, pay_max_cents, pay_unit, housing_provided, meals_provided, visa_sponsorship,
      min_age, timezone, submitted_by
    ) values (
      ${revisionId}, ${listingId}, ${orgId}, 1, 'screening', '{}'::jsonb, 'Lift Operator',
      'seasonal', 'ski_resorts', 'lift_operator', 'employee', 'full_time', 1, 'ongoing', 40,
      'range', 1900, 2200, 'hour', false, false, 'none', 18, 'America/Denver',
      ${people.submittedBy ?? null}
    )
  `);
  return revisionId;
}

describe('listingRevisionOwners', () => {
  it("names each revision's organization, its submitter and the listing's creator", async () => {
    const org = await seedHostOrg(t.db);
    const editor = (await seedMember(t.db, org.orgId, 'admin')).userId;
    const other = await seedHostOrg(t.db, { name: 'Glacier Bay Tours' });
    const both = await seedRevision(org.orgId, {
      createdBy: org.owner.userId,
      submittedBy: editor,
    });
    const same = await seedRevision(org.orgId, {
      createdBy: org.owner.userId,
      submittedBy: org.owner.userId,
    });
    const nobody = await seedRevision(other.orgId);

    const owners = await listingRevisionOwners(t.db, [both, same, nobody]);

    expect(owners.size).toBe(3);
    expect(owners.get(both)?.orgId).toBe(org.orgId);
    expect(owners.get(both)?.userIds.sort()).toEqual([editor, org.owner.userId].sort());
    expect(owners.get(same)).toEqual({ orgId: org.orgId, userIds: [org.owner.userId] });
    expect(owners.get(nobody)).toEqual({ orgId: other.orgId, userIds: [] });
  });

  it('leaves out ids that name no revision or are not uuids, and reads nothing for none', async () => {
    const org = await seedHostOrg(t.db);
    const revision = await seedRevision(org.orgId, { createdBy: org.owner.userId });

    const owners = await listingRevisionOwners(t.db, [revision, revision, newId(), 'not-a-uuid']);

    expect([...owners.keys()]).toEqual([revision]);
    expect(await listingRevisionOwners(t.db, [])).toEqual(new Map());
    expect(await listingRevisionOwners(t.db, ['not-a-uuid'])).toEqual(new Map());
  });
});
