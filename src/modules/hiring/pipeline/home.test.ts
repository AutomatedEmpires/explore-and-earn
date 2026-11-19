import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import type { InterviewItem } from '@/lib/hiring/types';
import * as messaging from '@/modules/messaging';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedInvite, seedSeeker } from '@tests/helpers/sp5';
import { getHostHome, getOrgHiringSummary } from './home';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
const mocks = vi.hoisted(() => ({
  listHostInterviews: vi.fn(async (): Promise<{ items: unknown[] }> => ({ items: [] })),
}));
vi.mock('../interviews/host', () => ({ listHostInterviews: mocks.listHostInterviews }));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
  messagingFake.reset();
  mocks.listHostInterviews.mockReset();
  mocks.listHostInterviews.mockResolvedValue({ items: [] });
});

describe('host home', () => {
  it("counts today's applicants on the host's local day in Anchorage", async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator', openings: 2 });
    const seeker = await seedSeeker(t.db);
    await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      appliedAt: new Date('2027-01-14T10:00:00.000Z'),
    });
    await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      appliedAt: new Date('2027-01-14T08:59:00.000Z'),
    });
    vi.spyOn(messaging, 'unreadThreadCount').mockResolvedValueOnce(4);

    const home = await getHostHome(t.db, org.owner.ctx, {
      tz: 'America/Anchorage',
      now: new Date('2027-01-15T08:30:00.000Z'),
    });
    expect(home.todayApplicants).toBe(1);
    expect(home.unreadThreads).toBe(4);
    expect(home.todayInterviews).toEqual([]);
  });

  it('lists an active listing whose hires fill its openings and skips a closed one', async () => {
    const org = await seedHostOrg(t.db);
    const openId = newId();
    const closedId = newId();
    listingsFake.setListing({ id: openId, orgId: org.orgId, title: 'Open role', status: 'active', openings: 1 });
    listingsFake.setListing({ id: closedId, orgId: org.orgId, title: 'Closed role', status: 'closed', openings: 1 });
    const seeker = await seedSeeker(t.db);
    await seedEntry(t.db, { orgId: org.orgId, listingId: openId, seekerUserId: seeker.userId, status: 'hired' });
    await seedEntry(t.db, {
      orgId: org.orgId,
      listingId: closedId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      status: 'hired',
    });
    const home = await getHostHome(t.db, org.owner.ctx, { tz: 'America/Anchorage', now: new Date('2027-01-15T08:30:00.000Z') });
    expect(home.openingsFilled).toEqual([{ listingId: openId, title: 'Open role' }]);
  });

  it('counts sent invites without held ones and active interviews', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      scanState: 'clear',
    });
    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: other.userId,
      sentBy: org.owner.userId,
      scanState: 'held',
    });
    const first = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId, status: 'hired' });
    const second = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: other.userId, status: 'new' });
    const third = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: (await seedSeeker(t.db)).userId,
      status: 'new',
    });
    await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: first,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'scheduled',
    });
    await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: second,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'invited',
    });
    await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: third,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'declined',
    });
    const summary = await getOrgHiringSummary(t.db, org.orgId);
    expect(summary).toMatchObject({ applicants: 3, hires: 1, invitesSent: 1, activeInterviews: 2 });
  });

  describe("today's interviews and the verified-host gate (legal review 7.1)", () => {
    const interview = { interviewId: newId(), applicationId: newId() } as unknown as InterviewItem;
    const setStatus = (orgId: string, status: string) =>
      t.db.execute(sql`update app.organizations set verification_status = ${status} where id = ${orgId}`);
    const home = (ctx: Parameters<typeof getHostHome>[1]) =>
      getHostHome(t.db, ctx, { tz: 'America/Anchorage', now: new Date('2027-01-15T08:30:00.000Z') });

    it('lists them for a verified host', async () => {
      const org = await seedHostOrg(t.db);
      await setStatus(org.orgId, 'verified');
      mocks.listHostInterviews.mockResolvedValue({ items: [interview] });
      expect((await home(org.owner.ctx)).todayInterviews).toEqual([interview]);
    });

    it.each(['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const)(
      'shows none while verification is %s, and reads none',
      async (status) => {
        const org = await seedHostOrg(t.db);
        await setStatus(org.orgId, status);
        mocks.listHostInterviews.mockResolvedValue({ items: [interview] });
        const out = await home(org.owner.ctx);
        expect(out.todayInterviews).toEqual([]);
        expect(mocks.listHostInterviews).not.toHaveBeenCalled();
      },
    );
  });
});
