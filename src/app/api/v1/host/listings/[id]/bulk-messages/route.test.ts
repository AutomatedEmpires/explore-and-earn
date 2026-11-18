import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import { seedHostOrg } from '@tests/helpers/sp5';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
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
});
