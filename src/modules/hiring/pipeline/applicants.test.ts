import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSnapshotV1, HostApplicationCard } from '@/lib/applications';
import { newId } from '@/lib/ids';
import { pipelineEntries, pipelineEvents } from '../schema';
import * as applications from '@/modules/applications';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedLocation } from '@tests/helpers/sp2';
import { FIXED_NOW, seedEntry, seedHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp5';
import { getApplicantDetail, listApplicants, listApplicationIdsByStatus } from './applicants';

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

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  applicationsFake.reset();
  listingsFake.reset();
  messagingFake.reset();
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
