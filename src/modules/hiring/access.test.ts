import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import type { HostContext } from '@/server/guards';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));

import { requireListing } from '@/modules/hiring/access';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const db = {} as never;

function host(userId: string, orgId: string, role: HostContext['role']): HostContext {
  return { user: { id: userId, clerkUserId: userId, accountType: 'host', email: null }, orgId, role };
}

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
});

describe('requireListing', () => {
  it('returns an in-scope listing and hides one the recruiter cannot see', async () => {
    const orgId = newId();
    const recruiterId = newId();
    listingsFake.setListing({ id: A, orgId, locationId: L1, title: 'A' });
    listingsFake.setListing({ id: B, orgId, locationId: L2, title: 'B' });
    listingsFake.setListing({ id: C, orgId, locationId: L2, title: 'C' });
    orgsFake.setAccess(recruiterId, { all: false, listingIds: [C], locationIds: [L1] });
    const recruiter = host(recruiterId, orgId, 'recruiter');

    await expect(requireListing(db, recruiter, B)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Listing not found',
    });
    await expect(requireListing(db, recruiter, A)).resolves.toMatchObject({ id: A, title: 'A' });
  });
});
