import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSnapshotV1, ApplicationStatus, HostApplicationCard } from '@/lib/applications';
import { newId } from '@/lib/ids';
import type { FitInputs } from '@/lib/profiles';
import { interviews, offers, pipelineEntries, pipelineEvents } from '../schema';
import * as applications from '@/modules/applications';
import { setSetting } from '@/modules/settings';
import { applicationsFake, profilesFake } from '@tests/fakes/sp5/sp4';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedLocation } from '@tests/helpers/sp2';
import { queryRows, type DbOrTx } from '@/lib/db';
import { NEW_HOST_DAILY_CAP, consumeNewHostDaily } from '@/modules/ratelimit';
import {
  FIXED_NOW,
  seedEntry,
  seedHostOrg as seedUnverifiedHostOrg,
  seedInterview,
  seedMember,
  seedOffer,
  seedSeeker,
} from '@tests/helpers/sp5';
import { getApplicantDetail, listApplicants, listApplicationIdsByStatus } from './applicants';

/** A verified host org: only a verified host reads applicants (legal review 7.1). */
async function seedHostOrg(db: DbOrTx) {
  const org = await seedUnverifiedHostOrg(db);
  await db.execute(sql`update app.organizations set verification_status = 'verified' where id = ${org.orgId}`);
  return org;
}

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
// Only SP4's FitInputs: where a seeker lives decides the fit switch (issue 198). A seeker the
// fake has no inputs for has no profile, so no known home state.
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  getFitInputs: (await import('@tests/fakes/sp5/sp4')).profilesFake.getFitInputs,
}));

const OPERATOR = { operatorId: '019a4a3c-0000-7000-8000-00000000f001' };
const HOUR = 60 * 60 * 1000;

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await setSetting(t.db, 'hiring.fit_enabled', true, OPERATOR);
  await setSetting(t.db, 'hiring.fit_disabled_states', [], OPERATOR);
  applicationsFake.reset();
  listingsFake.reset();
  messagingFake.reset();
  profilesFake.reset();
  vi.spyOn(applications, 'getHostCards').mockImplementation(async (_db, input) =>
    input.applicationIds.map((applicationId) => card(applicationId, null)),
  );
  vi.spyOn(applications, 'getSnapshot').mockResolvedValue(null);
});

function card(applicationId: string, avatarMediaId: string | null): HostApplicationCard {
  return {
    applicationId,
    listingId: newId(),
    status: 'new',
    source: 'seek',
    submittedAt: FIXED_NOW.toISOString(),
    firstName: 'Maya',
    lastName: 'Chen',
    city: 'Anchorage',
    region: 'AK',
    avatarMediaId,
    coverMediaId: null,
    availabilityDate: null,
    skills: [],
    additionalStepCompletedAt: null,
  };
}

describe('applicants', () => {
  it('limits a recruiter to listings at their location', async () => {
    const org = await seedHostOrg(t.db);
    const loc1 = await seedLocation(t.db, { orgId: org.orgId, city: 'Anchorage', state: 'AK' });
    const loc2 = await seedLocation(t.db, { orgId: org.orgId, city: 'Juneau', state: 'AK' });
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    await t.db.execute(sql`
      insert into app.member_assignments (id, membership_id, location_id)
      values (${newId()}, ${recruiter.membershipId}, ${loc1})
    `);
    const listingA = newId();
    const listingB = newId();
    listingsFake.setListing({ id: listingA, orgId: org.orgId, locationId: loc1, title: 'A' });
    listingsFake.setListing({ id: listingB, orgId: org.orgId, locationId: loc2, title: 'B' });
    const seeker = await seedSeeker(t.db);
    const onA = await seedEntry(t.db, { orgId: org.orgId, listingId: listingA, seekerUserId: seeker.userId });
    await seedEntry(t.db, {
      orgId: org.orgId,
      listingId: listingB,
      seekerUserId: (await seedSeeker(t.db)).userId,
    });

    const page = await listApplicants(t.db, recruiter.ctx, { sort: 'newest', limit: 25 });
    expect(page.items.map((item) => item.applicationId)).toEqual([onA]);
    await expect(
      listApplicants(t.db, recruiter.ctx, { listingId: listingB, sort: 'newest', limit: 25 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('sorts by fit with nulls last and pages with a cursor', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId });
    const seeker = await seedSeeker(t.db);
    const low = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId, fitScore: 80 });
    const missing = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      fitScore: null,
    });
    const high = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      fitScore: 95,
    });
    const fitted = await listApplicants(t.db, org.owner.ctx, { listingId, sort: 'fit', limit: 25 });
    expect(fitted.items.map((item) => item.applicationId)).toEqual([high, low, missing]);
    expect(fitted.items.map((item) => item.fitScore)).toEqual([95, 80, null]);

    const pageListing = newId();
    listingsFake.setListing({ id: pageListing, orgId: org.orgId, title: 'Paged' });
    const newestIds: string[] = [];
    for (const hours of [1, 2, 3]) {
      newestIds.push(
        await seedEntry(t.db, {
          orgId: org.orgId,
          listingId: pageListing,
          seekerUserId: (await seedSeeker(t.db)).userId,
          appliedAt: new Date(FIXED_NOW.getTime() + hours * 60 * 60 * 1000),
        }),
      );
    }
    const first = await listApplicants(t.db, org.owner.ctx, { sort: 'newest', limit: 2, listingId: pageListing });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listApplicants(t.db, org.owner.ctx, {
      sort: 'newest',
      limit: 2,
      listingId: pageListing,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.applicationId)).toEqual([
      newestIds[2],
      newestIds[1],
      newestIds[0],
    ]);
  });

  it('keeps other statuses in the counts and leaves a missing avatar empty', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId });
    const seeker = await seedSeeker(t.db);
    await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId, status: 'new' });
    await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      status: 'shortlisted',
    });
    const page = await listApplicants(t.db, org.owner.ctx, { status: ['new'], sort: 'newest', limit: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.counts.shortlisted).toBe(1);
    expect(page.items[0]?.avatarUrl).toBeNull();
  });

  it('returns history in order and 404 when the snapshot is gone', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId });
    const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId });
    await t.db.insert(pipelineEvents).values([
      {
        id: newId(),
        orgId: org.orgId,
        listingId,
        applicationId,
        kind: 'applied',
        actorType: 'seeker',
        actorUserId: seeker.userId,
        occurredAt: new Date('2026-11-01T00:00:00.000Z'),
      },
      {
        id: newId(),
        orgId: org.orgId,
        listingId,
        applicationId,
        kind: 'shortlisted',
        actorType: 'host',
        actorUserId: org.owner.userId,
        occurredAt: new Date('2026-11-02T00:00:00.000Z'),
      },
    ]);
    await expect(getApplicantDetail(t.db, org.owner.ctx, applicationId)).rejects.toMatchObject({
      status: 404,
      message: "This application isn't available",
    });

    vi.mocked(applications.getSnapshot).mockResolvedValue({ v: 1 } as ApplicationSnapshotV1);
    const detail = await getApplicantDetail(t.db, org.owner.ctx, applicationId);
    expect(detail.history.map((item) => item.kind)).toEqual(['applied', 'shortlisted']);
    expect(detail.fit).toBeNull();
    await t.db
      .update(pipelineEntries)
      .set({ fitScore: 80, fitLines: [], fitWeightsVersion: 'fit_weights@test' })
      .where(eq(pipelineEntries.applicationId, applicationId));
    const scored = await getApplicantDetail(t.db, org.owner.ctx, applicationId);
    expect(scored.fit).toMatchObject({ score: 80, weightsVersion: 'fit_weights@test' });
  });

  describe('verified-host gate (legal review 7.1)', () => {
    async function scored() {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId });
      const seeker = await seedSeeker(t.db);
      const applicationId = await seedEntry(t.db, {
        orgId: org.orgId,
        listingId,
        seekerUserId: seeker.userId,
        fitScore: 90,
      });
      vi.mocked(applications.getSnapshot).mockResolvedValue({ v: 1 } as ApplicationSnapshotV1);
      return { org, listingId, applicationId };
    }

    const setStatus = (orgId: string, status: string) =>
      t.db.execute(sql`update app.organizations set verification_status = ${status} where id = ${orgId}`);

    it.each(['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const)(
      'refuses the list and the detail while verification is %s, for applicants already received',
      async (status) => {
        const { org, applicationId } = await scored();
        await setStatus(org.orgId, 'verified');
        expect((await listApplicants(t.db, org.owner.ctx, { sort: 'newest', limit: 25 })).items).toHaveLength(1);

        await setStatus(org.orgId, status);
        vi.mocked(applications.getHostCards).mockClear();
        vi.mocked(applications.getSnapshot).mockClear();
        const refusal = { status: 409, code: 'conflict', details: { reason: `verification_${status}` } };
        await expect(listApplicants(t.db, org.owner.ctx, { sort: 'newest', limit: 25 })).rejects.toMatchObject(
          refusal,
        );
        await expect(getApplicantDetail(t.db, org.owner.ctx, applicationId)).rejects.toMatchObject(refusal);
        expect(applications.getHostCards).not.toHaveBeenCalled();
        expect(applications.getSnapshot).not.toHaveBeenCalled();
      },
    );

    it('serves a verified host', async () => {
      const { org, applicationId } = await scored();
      await setStatus(org.orgId, 'verified');
      const detail = await getApplicantDetail(t.db, org.owner.ctx, applicationId);
      expect(detail.card.applicationId).toBe(applicationId);
    });
  });

  describe('a new host opening an applicant (legal review 7.3)', () => {
    async function oneApplicant() {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId });
      const seeker = await seedSeeker(t.db);
      const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId });
      vi.mocked(applications.getSnapshot).mockResolvedValue({ v: 1 } as ApplicationSnapshotV1);
      return { org, applicationId };
    }

    it('audits the open and queues the silent-host check for that application', async () => {
      const { org, applicationId } = await oneApplicant();
      await getApplicantDetail(t.db, org.owner.ctx, applicationId);
      await getApplicantDetail(t.db, org.owner.ctx, applicationId);
      const views = await queryRows<{ actorId: string; subjectId: string }>(
        t.db,
        sql`select actor_id::text as "actorId", subject_id as "subjectId" from app.audit_events
          where action = 'applications.snapshot_viewed' and org_id = ${org.orgId}`,
      );
      expect(views).toEqual([
        { actorId: org.owner.userId, subjectId: applicationId },
        { actorId: org.owner.userId, subjectId: applicationId },
      ]);
      const checks = await queryRows<{ dedupeKey: string }>(
        t.db,
        sql`select dedupe_key as "dedupeKey" from app.outbox
          where topic = 'applications.silent_host_check' and payload->>'orgId' = ${org.orgId}`,
      );
      expect(checks).toEqual([{ dedupeKey: `silent-host:${org.orgId}:${applicationId}` }]);
    });

    it("refuses a new host over today's profile views with 429, and reads nothing", async () => {
      const { org, applicationId } = await oneApplicant();
      for (let i = 0; i < NEW_HOST_DAILY_CAP.profile_views; i++) {
        await consumeNewHostDaily(t.db, org.orgId, 'profile_views', new Date());
      }
      vi.mocked(applications.getSnapshot).mockClear();
      await expect(getApplicantDetail(t.db, org.owner.ctx, applicationId)).rejects.toMatchObject({
        status: 429,
        details: { reason: 'new_host_daily_cap' },
      });
      expect(applications.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('stored fit while fit is off for the listing (spec 8.3)', () => {
    async function threeApplicants(o: { state?: string } = {}) {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId, state: o.state ?? 'CO' });
      const at = (hours: number) => new Date(FIXED_NOW.getTime() + hours * HOUR);
      const seed = async (fitScore: number | null, hours: number) =>
        seedEntry(t.db, {
          orgId: org.orgId,
          listingId,
          seekerUserId: (await seedSeeker(t.db)).userId,
          fitScore,
          appliedAt: at(hours),
        });
      // Fit order is best, good, none; newest-first order is good, none, best.
      const best = await seed(95, 1);
      const none = await seed(null, 2);
      const good = await seed(80, 3);
      return { org, listingId, best, none, good };
    }

    it('shows scores and sorts by them while fit is on', async () => {
      const s = await threeApplicants();
      const page = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'fit', limit: 25 });
      expect(page.items.map((item) => item.applicationId)).toEqual([s.best, s.good, s.none]);
      expect(page.items.map((item) => item.fitScore)).toEqual([95, 80, null]);
    });

    it.each([
      ['hiring.fit_enabled is false', async () => setSetting(t.db, 'hiring.fit_enabled', false, OPERATOR)],
      ["the listing's state is disabled", async () => setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR)],
    ])('hides every score and sorts by newest when %s', async (_label, turnOff) => {
      const s = await threeApplicants();
      await turnOff();
      const page = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'fit', limit: 25 });
      expect(page.items.map((item) => item.applicationId)).toEqual([s.good, s.none, s.best]);
      expect(page.items.map((item) => item.fitScore)).toEqual([null, null, null]);

      const newest = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'newest', limit: 25 });
      expect(newest.items.map((item) => item.fitScore)).toEqual([null, null, null]);

      vi.mocked(applications.getSnapshot).mockResolvedValue({ v: 1 } as ApplicationSnapshotV1);
      await t.db
        .update(pipelineEntries)
        .set({ fitLines: [], fitWeightsVersion: 'fit_weights@test' })
        .where(eq(pipelineEntries.applicationId, s.best));
      const detail = await getApplicantDetail(t.db, s.org.owner.ctx, s.best);
      expect(detail.fit).toBeNull();
      expect(detail.card.fitScore).toBeNull();
    });

    it('pages sort=fit with a cursor that carries no hidden score', async () => {
      const s = await threeApplicants();
      await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
      const first = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'fit', limit: 1 });
      expect(first.items.map((item) => item.applicationId)).toEqual([s.good]);
      const decoded = JSON.parse(Buffer.from(first.nextCursor ?? '', 'base64url').toString('utf8')) as {
        fitScore: unknown;
      };
      expect(decoded.fitScore).toBeNull();
      const rest = await listApplicants(t.db, s.org.owner.ctx, {
        listingId: s.listingId,
        sort: 'fit',
        limit: 25,
        cursor: first.nextCursor ?? undefined,
      });
      expect(rest.items.map((item) => item.applicationId)).toEqual([s.none, s.best]);
    });

    it('keeps scores on listings where fit is on when one listing of the org turns off', async () => {
      const off = await threeApplicants({ state: 'CO' });
      const onListing = newId();
      listingsFake.setListing({ id: onListing, orgId: off.org.orgId, state: 'UT' });
      const onEntry = await seedEntry(t.db, {
        orgId: off.org.orgId,
        listingId: onListing,
        seekerUserId: (await seedSeeker(t.db)).userId,
        fitScore: 40,
        appliedAt: new Date(FIXED_NOW.getTime() - HOUR),
      });
      await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
      const page = await listApplicants(t.db, off.org.owner.ctx, { sort: 'fit', limit: 25 });
      // The UT score ranks; the CO applicants follow, newest first, with no score.
      expect(page.items.map((item) => item.applicationId)).toEqual([onEntry, off.good, off.none, off.best]);
      expect(page.items.map((item) => item.fitScore)).toEqual([40, null, null, null]);
    });

    // The daily refresh skips listings that are not live and finished applicants, so only the
    // read keeps these scores hidden.
    it.each(['in_review', 'closed'] as const)(
      'hides scores on a %s listing and on finished applicants once fit is off',
      async (listingStatus) => {
        const org = await seedHostOrg(t.db);
        const listingId = newId();
        listingsFake.setListing({ id: listingId, orgId: org.orgId, status: listingStatus });
        const finished: ApplicationStatus[] = ['hired', 'not_selected', 'withdrawn', 'offer_declined'];
        for (const status of finished) {
          await seedEntry(t.db, {
            orgId: org.orgId,
            listingId,
            seekerUserId: (await seedSeeker(t.db)).userId,
            status,
            fitScore: 70,
          });
        }
        await setSetting(t.db, 'hiring.fit_enabled', false, OPERATOR);
        const page = await listApplicants(t.db, org.owner.ctx, { listingId, sort: 'fit', limit: 25 });
        expect(page.items).toHaveLength(finished.length);
        expect(page.items.map((item) => item.fitScore)).toEqual(finished.map(() => null));
      },
    );
  });

  describe("the detail's interview and offer (issue 198)", () => {
    async function oneApplicant() {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId });
      const seeker = await seedSeeker(t.db);
      const applicationId = await seedEntry(t.db, {
        orgId: org.orgId,
        listingId,
        seekerUserId: seeker.userId,
        status: 'offered',
      });
      vi.mocked(applications.getSnapshot).mockResolvedValue({ v: 1 } as ApplicationSnapshotV1);
      return { org, listingId, seekerUserId: seeker.userId, applicationId, threadId: newId() };
    }

    it("returns the application's latest interview and offer", async () => {
      const s = await oneApplicant();
      const row = {
        orgId: s.org.orgId,
        listingId: s.listingId,
        applicationId: s.applicationId,
        threadId: s.threadId,
      };
      const earlier = await seedInterview(t.db, { ...row, organizerUserId: s.org.owner.userId, status: 'canceled' });
      const current = await seedInterview(t.db, { ...row, organizerUserId: s.org.owner.userId, status: 'scheduled' });
      const before = new Date(FIXED_NOW.getTime() - 24 * HOUR);
      await t.db.update(interviews).set({ createdAt: before }).where(eq(interviews.id, earlier));
      // One offer is open at a time, so the earlier one is canceled before the next is sent.
      const canceledOffer = await seedOffer(t.db, { ...row, createdBy: s.org.owner.userId, position: 'Deckhand' });
      await t.db.update(offers).set({ status: 'canceled', createdAt: before }).where(eq(offers.id, canceledOffer));
      const offer = await seedOffer(t.db, { ...row, createdBy: s.org.owner.userId, position: 'Lead deckhand' });
      // Another applicant's interview and offer are not this one's.
      const other = await oneApplicant();
      const otherRow = { orgId: other.org.orgId, listingId: other.listingId, applicationId: other.applicationId };
      await seedInterview(t.db, { ...otherRow, threadId: other.threadId, organizerUserId: other.org.owner.userId });
      await seedOffer(t.db, { ...otherRow, threadId: other.threadId, createdBy: other.org.owner.userId });

      const detail = await getApplicantDetail(t.db, s.org.owner.ctx, s.applicationId);
      expect(detail.interview).toMatchObject({ id: current, applicationId: s.applicationId, status: 'scheduled' });
      expect(detail.interview?.slots).toHaveLength(1);
      expect(detail.offer).toMatchObject({
        id: offer,
        applicationId: s.applicationId,
        status: 'sent',
        position: 'Lead deckhand',
      });
    });

    it('returns null for each when the application has neither', async () => {
      const s = await oneApplicant();
      const detail = await getApplicantDetail(t.db, s.org.owner.ctx, s.applicationId);
      expect(detail.interview).toBeNull();
      expect(detail.offer).toBeNull();
    });
  });

  describe('stored fit for a seeker who lives in a disabled state (lead decision 2026-11-18, issue 198)', () => {
    /** The seeker's home as SP4's FitInputs carries it. */
    function home(seekerUserId: string, region: string | null, countryCode = 'US'): void {
      const inputs: FitInputs = {
        seekerUserId,
        categories: [],
        occupationCodes: [],
        availabilityDate: null,
        skillKeys: [],
        certifications: [],
        workAuthorization: null,
        minPay: null,
        willingToRelocate: false,
        preferredStates: [],
        region,
        countryCode,
      };
      profilesFake.setPoolSeeker(
        {
          seekerUserId,
          firstName: 'Maya',
          lastInitial: 'C',
          city: 'Denver',
          region,
          countryCode,
          availabilityDate: '2026-12-01',
          skills: [],
          avatarMediaId: null,
          coverMediaId: null,
          categories: [],
        },
        inputs,
      );
    }

    /** An on-site Montana listing with a Coloradan, a Montanan and a seeker with no known home. */
    async function montanaListing() {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId, state: 'MT' });
      const seed = async (fitScore: number, hours: number, where: string | null) => {
        const { userId } = await seedSeeker(t.db);
        if (where) home(userId, where);
        const applicationId = await seedEntry(t.db, {
          orgId: org.orgId,
          listingId,
          seekerUserId: userId,
          fitScore,
          appliedAt: new Date(FIXED_NOW.getTime() + hours * HOUR),
        });
        return applicationId;
      };
      // Fit order is coloradan, montanan, unknown; newest first is unknown, montanan, coloradan.
      const coloradan = await seed(95, 1, 'CO');
      const montanan = await seed(80, 2, 'MT');
      const unknown = await seed(70, 3, null);
      await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
      return { org, listingId, coloradan, montanan, unknown };
    }

    it('hides that score on a listing elsewhere and ranks the seeker as unscored', async () => {
      const s = await montanaListing();
      const fit = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'fit', limit: 25 });
      expect(fit.items.map((item) => item.applicationId)).toEqual([s.montanan, s.unknown, s.coloradan]);
      expect(fit.items.map((item) => item.fitScore)).toEqual([80, 70, null]);

      const newest = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'newest', limit: 25 });
      expect(newest.items.map((item) => item.fitScore)).toEqual([70, 80, null]);

      vi.mocked(applications.getSnapshot).mockResolvedValue({ v: 1 } as ApplicationSnapshotV1);
      await t.db
        .update(pipelineEntries)
        .set({ fitLines: [], fitWeightsVersion: 'fit_weights@test' })
        .where(eq(pipelineEntries.listingId, s.listingId));
      const hidden = await getApplicantDetail(t.db, s.org.owner.ctx, s.coloradan);
      expect(hidden.card.fitScore).toBeNull();
      expect(hidden.fit).toBeNull();
      const shown = await getApplicantDetail(t.db, s.org.owner.ctx, s.montanan);
      expect(shown.fit).toMatchObject({ score: 80 });
    });

    it('pages sort=fit with a cursor that carries no hidden score', async () => {
      const s = await montanaListing();
      const first = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'fit', limit: 2 });
      expect(first.items.map((item) => item.applicationId)).toEqual([s.montanan, s.unknown]);
      const rest = await listApplicants(t.db, s.org.owner.ctx, {
        listingId: s.listingId,
        sort: 'fit',
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      });
      expect(rest.items.map((item) => item.applicationId)).toEqual([s.coloradan]);
      expect(rest.items[0]?.fitScore).toBeNull();
      expect(rest.nextCursor).toBeNull();
    });

    it('applies only the listing rule to a seeker with no US home state', async () => {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId, state: 'MT' });
      const abroad = (await seedSeeker(t.db)).userId;
      home(abroad, 'CO', 'MX');
      const noState = (await seedSeeker(t.db)).userId;
      home(noState, null);
      for (const seekerUserId of [abroad, noState]) {
        await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId, fitScore: 60 });
      }
      await setSetting(t.db, 'hiring.fit_disabled_states', ['CO'], OPERATOR);
      const page = await listApplicants(t.db, org.owner.ctx, { listingId, sort: 'fit', limit: 25 });
      expect(page.items.map((item) => item.fitScore)).toEqual([60, 60]);
    });

    it('reads no home state while no state is disabled', async () => {
      const s = await montanaListing();
      await setSetting(t.db, 'hiring.fit_disabled_states', [], OPERATOR);
      profilesFake.calls.length = 0;
      const page = await listApplicants(t.db, s.org.owner.ctx, { listingId: s.listingId, sort: 'fit', limit: 25 });
      expect(page.items.map((item) => item.fitScore)).toEqual([95, 80, 70]);
      expect(profilesFake.calls.filter((c) => c.name === 'getFitInputs')).toEqual([]);
    });
  });

  it('never returns a withdrawn application id', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    const seeker = await seedSeeker(t.db);
    const live = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId, status: 'new' });
    await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      status: 'withdrawn',
    });
    const ids = await listApplicationIdsByStatus(t.db, {
      orgId: org.orgId,
      listingId,
      statuses: ['new', 'withdrawn'],
    });
    expect(ids).toEqual([live]);
  });
});
