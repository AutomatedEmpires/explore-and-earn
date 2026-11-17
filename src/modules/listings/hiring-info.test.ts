import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedSeeker } from '../../../tests/helpers/sp2';
import { newId } from '@/lib/ids';
import { getHiringInfoMany, listForOrg } from './index';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

type When =
  | { dates: { mode: 'fixed'; start: string; end: string }; weeklyHours: number; minCommitment: null }
  | {
      dates: { mode: 'season'; season: 'summer'; year: number };
      weeklyHours: number;
      minCommitment: null;
    }
  | { dates: { mode: 'ongoing'; start: string | null }; weeklyHours: number; minCommitment: null };

const pay = {
  kind: 'range' as const,
  minCents: 1900,
  maxCents: 2200,
  unit: 'hour' as const,
  crewShareEstimate: null,
  overtime: false,
  tips: false,
  bonuses: null,
  frequency: 'weekly' as const,
  deductions: null,
};

async function insertPublishedListing(
  orgId: string,
  i: {
    when: When;
    skills?: string[];
    certifications?: string[];
    notifyMemberIds?: string[];
    openings?: number;
    stateCode?: string | null;
    remoteScope?: 'all_us' | 'states' | null;
    remoteStates?: string[] | null;
    timezone?: string;
    sponsorship?: 'none' | 'j1' | 'h2a' | 'h2b';
    listingState?: 'active' | 'closed' | 'draft';
    publish?: boolean;
    firstPublishedAt?: Date;
    closedAt?: Date | null;
    title?: string;
  },
): Promise<string> {
  const listingId = newId();
  const revisionId = newId();
  const publish = i.publish !== false && i.listingState !== 'draft';
  const content = {
    when: i.when,
    pay,
    job: {
      skills: i.skills ?? ['skiing'],
      certifications: i.certifications ?? ['cpr'],
      visaSponsorship: i.sponsorship ?? 'none',
    },
    applying: { notifyMemberIds: i.notifyMemberIds ?? [] },
  };
  const listingState = i.listingState ?? 'active';
  await t.db.execute(sql`
    insert into app.listings (id, org_id, state, title, location_id, first_published_at, closed_at, close_reason)
    values (${listingId}, ${orgId}, ${publish ? listingState : 'draft'}, ${i.title ?? 'Lift Operator'},
      ${newId()}, ${publish ? (i.firstPublishedAt ?? new Date('2027-01-01T00:00:00Z')) : null},
      ${i.closedAt ?? null}, ${listingState === 'closed' ? 'host' : null})
  `);
  await t.db.execute(sql`
    insert into app.listing_revisions (
      id, listing_id, org_id, revision_number, status, content, title, primary_category, genre,
      occupation_code, employment_type, schedule, openings, state_code, remote_scope, remote_states,
      date_mode, weekly_hours, pay_kind, pay_min_cents, pay_max_cents, pay_unit, housing_provided,
      housing_free, housing_cost_cents, housing_cost_period, meals_provided, visa_sponsorship, min_age, timezone
    ) values (
      ${revisionId}, ${listingId}, ${orgId}, 1, 'approved', ${JSON.stringify(content)}::jsonb,
      ${i.title ?? 'Lift Operator'}, 'seasonal', 'ski_resorts', 'lift_operator', 'employee', 'full_time',
      ${i.openings ?? 1}, ${i.stateCode ?? null}, ${i.remoteScope ?? null},
      ${i.remoteStates ? `{${i.remoteStates.join(',')}}` : null}::text[],
      ${i.when.dates.mode}, 40, 'range', 1900, 2200, 'hour', true, false, 15000, 'week', false,
      ${i.sponsorship ?? 'none'}, 18, ${i.timezone ?? 'America/Denver'}
    )
  `);
  if (publish) {
    await t.db.execute(
      sql`update app.listings set published_revision_id = ${revisionId} where id = ${listingId}`,
    );
  }
  return listingId;
}

describe('getHiringInfoMany', () => {
  it('reads a fixed-dates on-site listing, seasons, ongoing, and remote scopes', async () => {
    const { orgId } = await seedHostOrg(t.db);
    const memberId = newId();
    const fixed = await insertPublishedListing(orgId, {
      when: {
        dates: { mode: 'fixed', start: '2027-06-01', end: '2027-08-31' },
        weeklyHours: 40,
        minCommitment: null,
      },
      skills: ['skiing', 'guest_service'],
      certifications: ['cpr', 'first_aid'],
      notifyMemberIds: [memberId],
      openings: 2,
      stateCode: 'CO',
      timezone: 'America/Denver',
    });
    const summer = await insertPublishedListing(orgId, {
      when: { dates: { mode: 'season', season: 'summer', year: 2027 }, weeklyHours: 40, minCommitment: null },
      stateCode: 'CO',
    });
    const ongoing = await insertPublishedListing(orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
      stateCode: 'CO',
    });
    const allUs = await insertPublishedListing(orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
      remoteScope: 'all_us',
      stateCode: null,
    });
    const states = await insertPublishedListing(orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
      remoteScope: 'states',
      remoteStates: ['CO', 'UT'],
      stateCode: null,
    });
    const draft = await insertPublishedListing(orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
      listingState: 'draft',
    });
    const closed = await insertPublishedListing(orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
      listingState: 'closed',
      closedAt: new Date('2027-09-01T00:00:00Z'),
      stateCode: 'CO',
    });

    const rows = await getHiringInfoMany(t.db, [closed, fixed, summer, newId(), draft, allUs, states, ongoing]);
    expect(rows.map((row) => row.id)).toEqual([closed, fixed, summer, allUs, states, ongoing]);

    const onSite = rows.find((row) => row.id === fixed);
    expect(onSite).toMatchObject({
      startDate: '2027-06-01',
      endDate: '2027-08-31',
      state: 'CO',
      remoteStates: null,
      timezone: 'America/Denver',
      sponsorship: 'none',
      openings: 2,
      skills: ['skiing', 'guest_service'],
      requiredCertifications: ['cpr', 'first_aid'],
      notifyMemberIds: [memberId],
    });
    expect(rows.find((row) => row.id === summer)).toMatchObject({
      startDate: '2027-06-01',
      endDate: '2027-08-31',
    });
    expect(rows.find((row) => row.id === ongoing)).toMatchObject({ startDate: null, endDate: null });
    expect(rows.find((row) => row.id === allUs)).toMatchObject({ state: null, remoteStates: 'all_us' });
    expect(rows.find((row) => row.id === states)).toMatchObject({
      state: null,
      remoteStates: ['CO', 'UT'],
    });
    expect(rows.find((row) => row.id === closed)).toMatchObject({
      status: 'closed',
      closedAt: new Date('2027-09-01T00:00:00Z'),
    });
  });

  it('lists an org’s published listings and filters by status', async () => {
    const { orgId } = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db);
    const when = {
      dates: { mode: 'ongoing' as const, start: null },
      weeklyHours: 40,
      minCommitment: null,
    };
    const older = await insertPublishedListing(orgId, {
      when,
      stateCode: 'CO',
      firstPublishedAt: new Date('2027-01-01T00:00:00Z'),
      title: 'Older',
    });
    const newer = await insertPublishedListing(orgId, {
      when,
      listingState: 'closed',
      closedAt: new Date('2027-03-01T00:00:00Z'),
      stateCode: 'CO',
      firstPublishedAt: new Date('2027-02-01T00:00:00Z'),
      title: 'Newer',
    });
    await insertPublishedListing(orgId, { when, listingState: 'draft', stateCode: 'CO' });
    const elsewhere = await insertPublishedListing(other.orgId, {
      when,
      stateCode: 'UT',
      title: 'Other',
    });

    const all = await listForOrg(t.db, orgId);
    expect(all.map((row) => row.id)).toEqual([newer, older]);
    expect(all.map((row) => row.id)).not.toContain(elsewhere);
    const active = await listForOrg(t.db, orgId, { status: ['active'] });
    expect(active.map((row) => row.id)).toEqual([older]);
  });
});

describe('sp2 wiring', () => {
  it('imports module registrations', () => {
    const source = readFileSync('src/server/sp2-wiring.ts', 'utf8');
    expect(source).toContain(`import '@/server/module-registrations'`);
  });
});
