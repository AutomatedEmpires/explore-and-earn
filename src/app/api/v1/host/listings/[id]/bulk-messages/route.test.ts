import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkMessages } from '@/db/schema';
import { newId } from '@/lib/ids';
import { seedHostOrg } from '@tests/helpers/sp5';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import * as hiring from '@/modules/hiring';
// Seed helpers sit beside the messaging tests and are not part of the public API.
// eslint-disable-next-line no-restricted-imports
import { GATE_REFUSAL, GATED_STATUSES } from '@/modules/messaging/test-fixtures';
import { POST } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/hiring', async (orig) => ({
  ...(await orig<typeof import('@/modules/hiring')>()),
  listApplicationIdsByStatus: vi.fn(async () => []),
}));

const t = setupRouteDb();

describe('POST /host/listings/:id/bulk-messages', () => {
  beforeEach(() => {
    listingsFake.reset();
    orgsFake.reset();
  });

  it('answers 429 on the 6th bulk send in an hour', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
    orgsFake.setAccess(org.owner.userId, { all: true });
    asHost(org.owner.ctx);
    let last = 0;
    for (let n = 0; n < 6; n += 1) {
      const res = await call(
        POST,
        request('POST', `/api/v1/host/listings/${listingId}/bulk-messages`, {
          body: { statuses: ['new'], body: `Note ${n}` },
        }),
        { id: listingId },
      );
      last = res.status;
      if (n < 5) expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    expect(last).toBe(429);
  });

  it('answers a Billing member 403 role_not_allowed before any listing lookup', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
    asHost({ ...org.owner.ctx, role: 'billing' });
    const res = await call(
      POST,
      request('POST', `/api/v1/host/listings/${listingId}/bulk-messages`, {
        body: { statuses: ['new'], body: 'Note' },
      }),
      { id: listingId },
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { details: { reason: 'role_not_allowed' } } });
  });

  it('answers 404 for another org’s listing, even to an owner who sees every listing', async () => {
    const mine = await seedHostOrg(t.db);
    const theirs = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: theirs.orgId, title: 'Lift Operator' });
    orgsFake.setAccess(mine.owner.userId, { all: true });
    asHost(mine.owner.ctx);
    const res = await call(
      POST,
      request('POST', `/api/v1/host/listings/${listingId}/bulk-messages`, {
        body: { statuses: ['new'], body: 'Note' },
      }),
      { id: listingId },
    );
    expect(res.status).toBe(404);
    const stored = await t.db.select().from(bulkMessages).where(eq(bulkMessages.listingId, listingId));
    expect(stored).toEqual([]);
  });
});

// A host the applicant verification gate refuses sends no bulk message, with the applicant
// list's 409, before it reads which applicants the statuses cover (issue 199).
describe('POST /host/listings/:id/bulk-messages and the verified-host gate', () => {
  beforeEach(() => {
    listingsFake.reset();
    orgsFake.reset();
    vi.mocked(hiring.listApplicationIdsByStatus).mockClear();
  });

  it.each(GATED_STATUSES)(
    'refuses a host whose verification is %s with the applicant list 409',
    async (status) => {
      const org = await seedHostOrg(t.db);
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
      orgsFake.setAccess(org.owner.userId, { all: true });
      orgsFake.setOrgVerification(org.orgId, status);
      asHost(org.owner.ctx);
      const res = await call(
        POST,
        request('POST', `/api/v1/host/listings/${listingId}/bulk-messages`, {
          body: { statuses: ['new'], body: 'Pay the training fee to start' },
        }),
        { id: listingId },
      );
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: 'conflict',
          message: GATE_REFUSAL[status],
          details: { reason: `verification_${status}` },
        },
      });
      expect(hiring.listApplicationIdsByStatus).not.toHaveBeenCalled();
      const stored = await t.db
        .select()
        .from(bulkMessages)
        .where(eq(bulkMessages.listingId, listingId));
      expect(stored).toEqual([]);
    },
  );

  it('sends for a verified host', async () => {
    const org = await seedHostOrg(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
    orgsFake.setAccess(org.owner.userId, { all: true });
    orgsFake.setOrgVerification(org.orgId, 'verified');
    asHost(org.owner.ctx);
    const res = await call(
      POST,
      request('POST', `/api/v1/host/listings/${listingId}/bulk-messages`, {
        body: { statuses: ['new'], body: 'Still hiring' },
      }),
      { id: listingId },
    );
    expect(res.status).toBe(200);
    expect(hiring.listApplicationIdsByStatus).toHaveBeenCalled();
  });
});
