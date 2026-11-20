import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedLocation } from '@tests/helpers/sp2';
import { seedEntry, seedHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp5';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
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
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));

import { GET as LIST } from '@/app/api/v1/host/applicants/route';
import { POST as HIRE } from '@/app/api/v1/host/applicants/[applicationId]/hire/route';
import { POST as PASS } from '@/app/api/v1/host/applicants/[applicationId]/pass/route';
import { POST as SHORTLIST } from '@/app/api/v1/host/applicants/[applicationId]/shortlist/route';
import * as hiring from '@/modules/hiring';

const t = setupRouteDb();

beforeEach(() => {
  applicationsFake.reset();
  listingsFake.reset();
  messagingFake.reset();
  vi.restoreAllMocks();
});

describe('applicant routes', () => {
  it('refuses a billing member', async () => {
    const org = await seedHostOrg(t.db);
    const billing = await seedMember(t.db, org.orgId, 'billing');
    asHost(billing.ctx);
    const applicationId = newId();
    const listed = await call(LIST, request('GET', '/api/v1/host/applicants'));
    const passed = await call(PASS, request('POST', `/api/v1/host/applicants/${applicationId}/pass`), {
      applicationId,
    });
    const shortlisted = await call(
      SHORTLIST,
      request('POST', `/api/v1/host/applicants/${applicationId}/shortlist`, { body: { on: true } }),
      { applicationId },
    );
    const hired = await call(HIRE, request('POST', `/api/v1/host/applicants/${applicationId}/hire`), {
      applicationId,
    });
    expect(listed.status).toBe(403);
    expect(passed.status).toBe(403);
    expect(shortlisted.status).toBe(403);
    expect(hired.status).toBe(403);
    expect(passed.body).toMatchObject({ error: { code: 'forbidden', details: { reason: 'role_not_allowed' } } });
  });

  it('hides an applicant outside a recruiter’s location', async () => {
    const org = await seedHostOrg(t.db);
    // A verified host: the applicant gate comes first and would answer 409 otherwise (issue 234).
    await t.db.execute(sql`update app.organizations set verification_status = 'verified' where id = ${org.orgId}`);
    const loc1 = await seedLocation(t.db, { orgId: org.orgId });
    const loc2 = await seedLocation(t.db, { orgId: org.orgId, city: 'Juneau' });
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    await t.db.execute(sql`
      insert into app.member_assignments (id, membership_id, location_id)
      values (${newId()}, ${recruiter.membershipId}, ${loc1})
    `);
    const listingB = newId();
    listingsFake.setListing({ id: newId(), orgId: org.orgId, locationId: loc1, title: 'A' });
    listingsFake.setListing({ id: listingB, orgId: org.orgId, locationId: loc2, title: 'B' });
    const seeker = await seedSeeker(t.db);
    const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId: listingB, seekerUserId: seeker.userId });
    asHost(recruiter.ctx);
    const res = await call(PASS, request('POST', `/api/v1/host/applicants/${applicationId}/pass`), { applicationId });
    expect(res.status).toBe(404);
  });

  it('passes the application id into shortlist and pass', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
    const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId });
    const short = vi.spyOn(hiring, 'shortlist').mockResolvedValue({ status: 'shortlisted' });
    const passed = vi.spyOn(hiring, 'pass').mockResolvedValue({ undoUntil: '2026-11-03T17:00:10.000Z' });
    asHost(org.owner.ctx);

    const listed = await call(
      SHORTLIST,
      request('POST', `/api/v1/host/applicants/${applicationId}/shortlist`, { body: { on: true } }),
      { applicationId },
    );
    const body = await call(PASS, request('POST', `/api/v1/host/applicants/${applicationId}/pass`), {
      applicationId,
    });
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ status: 'shortlisted' });
    expect(short).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orgId: org.orgId }), applicationId, true);
    expect(body.status).toBe(200);
    expect(passed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: org.orgId }),
      applicationId,
    );
  });
});
