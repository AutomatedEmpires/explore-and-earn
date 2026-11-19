// POST /api/v1/reports over HTTP (SP4 spec 5 and 8.7, plan Task 26): who may report what, a
// host's applicant report by application id, the analytics event, the daily limit and the
// details cap.
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { queryRows } from '@/lib/db';
import { notFound, unauthorized } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { CurrentUser } from '@/modules/identity';
import type { HostContext } from '@/server/guards';
import { fakeHost, fakeListing, resetSp2 } from '@tests/fakes/sp4/sp2';
import {
  asHost,
  asSeeker,
  call,
  guardMocks,
  request,
  seedMember,
  seedOrg,
  seedUser,
  setupRouteDb,
} from '@tests/helpers/sp4';
import { POST } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
// W4 owns the host's application authorization; the route is tested against a stand-in.
const mocks = vi.hoisted(() => ({ authorizeHostApplication: vi.fn() }));
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  authorizeHostApplication: mocks.authorizeHostApplication,
}));
vi.mock('@/lib/analytics', async (orig) => ({
  ...(await orig<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
}));

const t = setupRouteDb();
let seeker: CurrentUser;
let host: HostContext;
let listingId: string;

beforeEach(async () => {
  resetSp2();
  vi.mocked(track).mockClear();
  mocks.authorizeHostApplication.mockReset();
  seeker = await seedUser(t.db, { accountType: 'seeker' });
  const { orgId } = await seedOrg(t.db);
  host = await seedMember(t.db, orgId, await seedUser(t.db, { accountType: 'host' }), 'recruiter');
  fakeHost(orgId);
  ({ listingId } = fakeListing({ orgId, title: 'Deckhand' }));
});

function post(body: unknown) {
  return call(POST, request('POST', '/api/v1/reports', { body }));
}

async function reportsBy(userId: string) {
  return queryRows<{ subject_type: string; subject_id: string; reporter_org_id: string | null }>(
    t.db,
    sql`select subject_type, subject_id, reporter_org_id from app.reports
        where reporter_user_id = ${userId}`,
  );
}

describe('POST /reports', () => {
  it('lets a seeker report a listing, and tracks only a new report', async () => {
    asSeeker(seeker);
    const body = { subjectType: 'listing', subjectId: listingId, reason: 'scam' };
    const first = await post({ ...body, details: 'They asked for a deposit.' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ reportId: expect.any(String) });
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      'report_created',
      { subjectType: 'listing', reason: 'scam' },
      seeker.id,
    );

    const repeat = await post(body);
    expect(repeat.status).toBe(201);
    expect(repeat.body).toEqual(first.body);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('refuses a host reporting a listing', async () => {
    asHost(host);
    const res = await post({ subjectType: 'listing', subjectId: listingId, reason: 'scam' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'forbidden', details: { reason: 'not_allowed' } } });
    expect(await reportsBy(host.user.id)).toEqual([]);
  });

  it("files a host's applicant report on the seeker, for the host's org", async () => {
    const applicant = await seedUser(t.db, { accountType: 'seeker' });
    await t.db.execute(sql`insert into app.seeker_profiles (user_id) values (${applicant.id})`);
    const applicationId = newId();
    mocks.authorizeHostApplication.mockResolvedValue({
      applicationId,
      listingId,
      orgId: host.orgId,
      seekerUserId: applicant.id,
      status: 'new',
      submittedAt: new Date(),
    });
    asHost(host);
    const res = await post({ subjectType: 'seeker_profile', subjectId: applicationId, reason: 'harassment' });
    expect(res.status).toBe(201);
    expect(mocks.authorizeHostApplication.mock.calls[0]?.slice(1)).toEqual([host, applicationId]);
    expect(await reportsBy(host.user.id)).toEqual([
      { subject_type: 'seeker_profile', subject_id: applicant.id, reporter_org_id: host.orgId },
    ]);
  });

  it('answers not_found when the host may not reach the application', async () => {
    mocks.authorizeHostApplication.mockRejectedValue(notFound('Application not found'));
    asHost(host);
    const res = await post({ subjectType: 'seeker_profile', subjectId: newId(), reason: 'spam' });
    expect(res.status).toBe(404);
    expect(await reportsBy(host.user.id)).toEqual([]);
  });

  it('refuses the 21st report in a day', async () => {
    asSeeker(seeker);
    const body = { subjectType: 'listing', subjectId: listingId, reason: 'spam' };
    for (let i = 0; i < 20; i++) expect((await post(body)).status).toBe(201);
    const res = await post(body);
    expect(res.status).toBe(429);
  });

  it('refuses details over 1,000 characters', async () => {
    asSeeker(seeker);
    const res = await post({
      subjectType: 'listing',
      subjectId: listingId,
      reason: 'other',
      details: 'x'.repeat(1001),
    });
    expect(res.status).toBe(400);
    expect(await reportsBy(seeker.id)).toEqual([]);
  });

  it('asks a guest to sign in', async () => {
    guardMocks().requireUser.mockRejectedValueOnce(unauthorized('Sign in required'));
    const res = await post({ subjectType: 'listing', subjectId: listingId, reason: 'spam' });
    expect(res.status).toBe(401);
  });
});
