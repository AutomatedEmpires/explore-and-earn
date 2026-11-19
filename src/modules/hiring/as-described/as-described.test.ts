import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { queryRows } from '@/lib/db';
// The getter stays off the hostpages index; public.ts is the only production caller.
// eslint-disable-next-line no-restricted-imports
import { getHostPageProvider } from '@/modules/hostpages/providers';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedOffer, seedSeeker, seedThread } from '@tests/helpers/sp5';
import { seedEntry } from '@tests/helpers/sp5';
import { asDescribedResponses, offers, pipelineEntries } from '../schema';
import { asDescribedDue } from './due';
import { getAsDescribedPrompt, submitAsDescribed } from './form';
import { openAsDescribed } from './open';
import './register';
import { getAsDescribedSummary } from './summary';

const DAY = 24 * 60 * 60 * 1000;

let t: TestDb;
const db = () => t.db as Db;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

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

async function insertListing(
  orgId: string,
  i: {
    title?: string;
    when:
      | { dates: { mode: 'fixed'; start: string; end: string }; weeklyHours: number; minCommitment: null }
      | { dates: { mode: 'ongoing'; start: string | null }; weeklyHours: number; minCommitment: null };
    housing?: boolean;
    meals?: boolean;
  },
): Promise<string> {
  const listingId = newId();
  const revisionId = newId();
  const title = i.title ?? 'Lift Operator';
  const content = {
    when: i.when,
    pay,
    job: { skills: ['skiing'], certifications: ['cpr'], visaSponsorship: 'none' },
    applying: { notifyMemberIds: [] },
  };
  await db().execute(sql`
    insert into app.listings (id, org_id, state, title, first_published_at)
    values (${listingId}, ${orgId}, 'active', ${title}, ${new Date('2027-01-01T00:00:00Z')})
  `);
  await db().execute(sql`
    insert into app.listing_revisions (
      id, listing_id, org_id, revision_number, status, content, title, primary_category, genre,
      occupation_code, employment_type, schedule, openings, state_code, date_mode, weekly_hours,
      pay_kind, pay_min_cents, pay_max_cents, pay_unit, housing_provided, housing_free,
      housing_cost_cents, housing_cost_period, meals_provided, visa_sponsorship, min_age, timezone
    ) values (
      ${revisionId}, ${listingId}, ${orgId}, 1, 'approved', ${JSON.stringify(content)}::jsonb,
      ${title}, 'seasonal', 'ski_resorts', 'lift_operator', 'employee', 'full_time',
      1, 'CO', ${i.when.dates.mode}, 40, 'range', 1900, 2200, 'hour',
      ${i.housing ?? false}, ${i.housing ? false : null}, ${i.housing ? 15000 : null},
      ${i.housing ? 'week' : null}, ${i.meals ?? false}, 'none', 18, 'America/Denver'
    )
  `);
  await db().execute(
    sql`update app.listings set published_revision_id = ${revisionId} where id = ${listingId}`,
  );
  return listingId;
}

async function promptCount(userId: string): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db(),
    sql`select count(*)::int as n from app.notifications
        where user_id = ${userId}::uuid and type = 'hiring.as_described_prompt'`,
  );
  return row?.n ?? 0;
}

async function responseFor(applicationId: string) {
  const [row] = await db()
    .select()
    .from(asDescribedResponses)
    .where(eq(asDescribedResponses.applicationId, applicationId));
  if (!row) throw new Error('missing as-described row');
  return row;
}

describe('as described', () => {
  it('prompts a host-marked hire the day after the listing ends, once', async () => {
    const org = await seedHostOrg(db(), { name: 'Kettle Ridge Lodge' });
    const seeker = await seedSeeker(db());
    const listingId = await insertListing(org.orgId, {
      title: 'Lift Operator',
      when: {
        dates: { mode: 'fixed', start: '2027-06-01', end: '2027-08-31' },
        weeklyHours: 40,
        minCommitment: null,
      },
    });
    const applicationId = await seedEntry(db(), {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'hired',
    });
    const hiredAt = new Date('2027-06-01T15:00:00.000Z');
    await db()
      .update(pipelineEntries)
      .set({ hiredSource: 'host', hiredAt })
      .where(eq(pipelineEntries.applicationId, applicationId));
    await openAsDescribed(db(), { applicationId, hiredSource: 'host', at: hiredAt });
    await openAsDescribed(db(), { applicationId, hiredSource: 'host', at: hiredAt });
    expect(await responseFor(applicationId)).toMatchObject({ eligibleVia: 'host_marked', asksHousing: false });

    await asDescribedDue(db(), new Date('2027-08-31T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(0);
    await asDescribedDue(db(), new Date('2027-09-01T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(1);
    await asDescribedDue(db(), new Date('2027-09-02T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(1);
  });

  it('is due 90 days after the hire when the listing has no end date', async () => {
    const org = await seedHostOrg(db());
    const seeker = await seedSeeker(db());
    const listingId = await insertListing(org.orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
    });
    const applicationId = await seedEntry(db(), {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'hired',
    });
    const hiredAt = new Date('2027-01-10T15:00:00.000Z');
    await db()
      .update(pipelineEntries)
      .set({ hiredSource: 'host', hiredAt })
      .where(eq(pipelineEntries.applicationId, applicationId));
    await openAsDescribed(db(), { applicationId, hiredSource: 'host', at: hiredAt });

    await asDescribedDue(db(), new Date('2027-04-09T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(0);
    await asDescribedDue(db(), new Date('2027-04-10T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(1);
  });

  it('uses an accepted offer start when an ongoing listing has one', async () => {
    const org = await seedHostOrg(db());
    const seeker = await seedSeeker(db());
    const listingId = await insertListing(org.orgId, {
      when: { dates: { mode: 'ongoing', start: null }, weeklyHours: 40, minCommitment: null },
    });
    const applicationId = await seedEntry(db(), {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'hired',
    });
    const threadId = await seedThread(db(), { orgId: org.orgId, listingId, seekerUserId: seeker.userId });
    const offerId = await seedOffer(db(), {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId,
      createdBy: org.owner.userId,
      startDate: '2027-02-01',
    });
    await db().update(offers).set({ status: 'accepted' }).where(eq(offers.id, offerId));
    const hiredAt = new Date('2027-01-10T15:00:00.000Z');
    await db()
      .update(pipelineEntries)
      .set({ hiredSource: 'offer_accepted', hiredAt })
      .where(eq(pipelineEntries.applicationId, applicationId));
    await openAsDescribed(db(), { applicationId, hiredSource: 'offer_accepted', at: hiredAt });

    await asDescribedDue(db(), new Date('2027-05-01T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(0);
    await asDescribedDue(db(), new Date('2027-05-02T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(1);
  });

  it('hides the org summary at 4 responses, shows it at 5, and a listing at 3', async () => {
    const org = await seedHostOrg(db());
    const seeker = await seedSeeker(db());
    const listingId = newId();
    const otherListing = newId();
    for (let n = 0; n < 3; n += 1) {
      await db().insert(asDescribedResponses).values({
        id: newId(),
        applicationId: newId(),
        orgId: org.orgId,
        listingId,
        seekerUserId: seeker.userId,
        eligibleVia: 'host_marked',
        asksHousing: true,
        asksMeals: false,
        housing: 'yes',
        pay: 'partly',
        promptedAt: new Date('2027-04-01T00:00:00.000Z'),
        submittedAt: new Date('2027-04-02T00:00:00.000Z'),
      });
    }
    expect(await getAsDescribedSummary(db(), { orgId: org.orgId })).toMatchObject({
      responses: 3,
      visible: false,
    });
    expect(await getAsDescribedSummary(db(), { orgId: org.orgId, listingId })).toMatchObject({
      responses: 3,
      visible: true,
      housing: { yes: 3, partly: 0, no: 0 },
    });
    expect(getHostPageProvider('as_described')).toBeTruthy();
    expect(await getHostPageProvider('as_described')?.fn(db(), org.orgId)).toBeNull();

    await db().insert(asDescribedResponses).values({
      id: newId(),
      applicationId: newId(),
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      eligibleVia: 'offer_accepted',
      asksHousing: false,
      asksMeals: false,
      workedHere: false,
      pay: 'yes',
      promptedAt: new Date('2027-04-01T00:00:00.000Z'),
      submittedAt: new Date('2027-04-02T00:00:00.000Z'),
    });
    expect(await getAsDescribedSummary(db(), { orgId: org.orgId })).toMatchObject({
      responses: 3,
      visible: false,
    });

    await db().insert(asDescribedResponses).values({
      id: newId(),
      applicationId: newId(),
      orgId: org.orgId,
      listingId: otherListing,
      seekerUserId: seeker.userId,
      eligibleVia: 'host_marked',
      asksHousing: false,
      asksMeals: false,
      pay: 'no',
      promptedAt: new Date('2027-04-01T00:00:00.000Z'),
      submittedAt: new Date('2027-04-02T00:00:00.000Z'),
    });
    await db().insert(asDescribedResponses).values({
      id: newId(),
      applicationId: newId(),
      orgId: org.orgId,
      listingId: otherListing,
      seekerUserId: seeker.userId,
      eligibleVia: 'host_marked',
      asksHousing: false,
      asksMeals: false,
      pay: 'yes',
      promptedAt: new Date('2027-04-01T00:00:00.000Z'),
      submittedAt: new Date('2027-04-02T00:00:00.000Z'),
    });
    const shown = await getAsDescribedSummary(db(), { orgId: org.orgId });
    expect(shown).toMatchObject({ responses: 5, visible: true });
    expect(await getHostPageProvider('as_described')?.fn(db(), org.orgId)).toEqual({
      responses: 5,
      housing: shown.housing,
      meals: shown.meals,
      pay: shown.pay,
    });
    expect(
      await getAsDescribedSummary(db(), { orgId: org.orgId, listingId: otherListing }),
    ).toMatchObject({ responses: 2, visible: false });

    const before = await getAsDescribedSummary(db(), { orgId: org.orgId });
    await db()
      .update(asDescribedResponses)
      .set({ seekerUserId: null })
      .where(eq(asDescribedResponses.orgId, org.orgId));
    expect(await getAsDescribedSummary(db(), { orgId: org.orgId })).toEqual(before);
  });

  it('does not count an offer-accepted answer when the seeker did not work there, and drops unasked housing', async () => {
    const org = await seedHostOrg(db(), { name: 'North Lodge' });
    const seeker = await seedSeeker(db());
    const other = await seedSeeker(db());
    const listingId = await insertListing(org.orgId, {
      title: 'Cook',
      when: {
        dates: { mode: 'fixed', start: '2027-06-01', end: '2027-08-31' },
        weeklyHours: 40,
        minCommitment: null,
      },
      housing: false,
    });
    const applicationId = await seedEntry(db(), {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'hired',
    });
    await openAsDescribed(db(), {
      applicationId,
      hiredSource: 'offer_accepted',
      at: new Date('2027-06-01T00:00:00.000Z'),
    });
    const row = await responseFor(applicationId);
    const promptedAt = new Date('2027-09-01T15:00:00.000Z');
    await db()
      .update(asDescribedResponses)
      .set({ promptedAt, expiresAt: new Date(promptedAt.getTime() + 60 * DAY) })
      .where(eq(asDescribedResponses.id, row.id));

    const prompt = await getAsDescribedPrompt(db(), seeker.userId, row.id, promptedAt);
    expect(prompt).toMatchObject({
      orgName: 'North Lodge',
      title: 'Cook',
      asksWorkedHere: true,
      asksHousing: false,
      state: 'open',
    });
    await expect(getAsDescribedPrompt(db(), other.userId, row.id, promptedAt)).rejects.toMatchObject({
      status: 404,
    });

    await submitAsDescribed(
      db(),
      seeker.userId,
      row.id,
      { workedHere: false, housing: 'yes', pay: 'no' },
      promptedAt,
    );
    const saved = await responseFor(applicationId);
    expect(saved.housing).toBeNull();
    expect(saved.workedHere).toBe(false);
    expect(await getAsDescribedSummary(db(), { orgId: org.orgId, listingId })).toMatchObject({
      responses: 0,
    });

    await expect(
      submitAsDescribed(db(), seeker.userId, row.id, { workedHere: true, pay: 'yes' }, promptedAt),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'closed' } });

    const late = new Date(promptedAt.getTime() + 61 * DAY);
    const again = await seedEntry(db(), {
      orgId: org.orgId,
      listingId,
      seekerUserId: other.userId,
      status: 'hired',
    });
    await openAsDescribed(db(), { applicationId: again, hiredSource: 'host', at: promptedAt });
    const second = await responseFor(again);
    await db()
      .update(asDescribedResponses)
      .set({ promptedAt, expiresAt: new Date(promptedAt.getTime() + 60 * DAY) })
      .where(eq(asDescribedResponses.id, second.id));
    await expect(
      submitAsDescribed(db(), other.userId, second.id, { pay: 'yes' }, late),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'closed' } });
  });

  it('does not prompt a seeker who shares an email domain with the host', async () => {
    const org = await seedHostOrg(db(), { ownerEmail: 'owner@shared.test' });
    const seeker = await seedSeeker(db(), { email: 'worker@shared.test' });
    const listingId = await insertListing(org.orgId, {
      when: {
        dates: { mode: 'fixed', start: '2027-06-01', end: '2027-08-31' },
        weeklyHours: 40,
        minCommitment: null,
      },
    });
    const applicationId = await seedEntry(db(), {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'hired',
    });
    await openAsDescribed(db(), { applicationId, hiredSource: 'host', at: new Date('2027-06-01T00:00:00.000Z') });
    await asDescribedDue(db(), new Date('2027-09-01T15:00:00.000Z'));
    expect(await promptCount(seeker.userId)).toBe(0);
  });
});
