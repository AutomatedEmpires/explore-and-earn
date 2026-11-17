import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/lib/ids';
import type { Member } from '@/modules/orgs';
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
import { listingScope, listingTeam } from '@/modules/messaging/access';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const db = {} as never;

function host(userId: string, orgId: string, role: HostContext['role']): HostContext {
  return { user: { id: userId, clerkUserId: userId, accountType: 'host', email: null }, orgId, role };
}

function member(role: Member['role'], userId = newId()): Member {
  return {
    membershipId: newId(),
    userId,
    displayName: null,
    email: null,
    role,
    scope: null,
    joinedAt: new Date(0),
  };
}

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
});

describe('listing scope', () => {
  it('expands an assigned recruiter by listing and location, and gives an owner everything', async () => {
    const orgId = newId();
    const recruiterId = newId();
    listingsFake.setListing({ id: A, orgId, locationId: L1, title: 'A' });
    listingsFake.setListing({ id: B, orgId, locationId: L2, title: 'B' });
    listingsFake.setListing({ id: C, orgId, locationId: L2, title: 'C' });
    orgsFake.setAccess(recruiterId, { all: false, listingIds: [C], locationIds: [L1] });
    const recruiter = host(recruiterId, orgId, 'recruiter');

    await expect(listingScope(db, recruiter)).resolves.toEqual({ all: false, listingIds: [A, C] });
    await expect(requireListing(db, recruiter, B)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Listing not found',
    });
    await expect(requireListing(db, recruiter, A)).resolves.toMatchObject({ id: A, title: 'A' });

    const ownerId = newId();
    orgsFake.setAccess(ownerId, { all: true });
    await expect(listingScope(db, host(ownerId, orgId, 'owner'))).resolves.toEqual({ all: true });
  });
});

describe('listing team', () => {
  it('keeps notify members who can see the listing, and falls back to the owner and admins', async () => {
    const orgId = newId();
    const listingId = newId();
    const owner = member('owner');
    const admin = member('admin');
    const recruiter = member('recruiter');
    const billing = member('billing');
    orgsFake.setMembers(orgId, [owner, admin, recruiter, billing]);
    orgsFake.setAccess(owner.userId, { all: true });
    orgsFake.setAccess(admin.userId, { all: true });
    orgsFake.setAccess(recruiter.userId, { all: false, listingIds: [], locationIds: [] });
    orgsFake.setAccess(billing.userId, { all: true });
    listingsFake.setListing({
      id: listingId,
      orgId,
      notifyMemberIds: [recruiter.membershipId, admin.membershipId],
    });

    await expect(listingTeam(db, { orgId, listingId })).resolves.toEqual([admin.userId]);

    listingsFake.setListing({ id: listingId, orgId, notifyMemberIds: [] });
    await expect(listingTeam(db, { orgId, listingId })).resolves.toEqual([owner.userId, admin.userId]);
  });
});
