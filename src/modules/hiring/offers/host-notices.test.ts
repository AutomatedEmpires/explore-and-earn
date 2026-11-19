// The offer answer notice to a host the applicant gate refuses (issue 222, the follow-up to 212).
// A seeker's accept or decline is refused before anything is sent while the host is refused
// (issue 212), so `hiring.offer_response` reaches a refused host only if its status changes
// during the answer. The notice layer still keeps the name out: each host recipient is told
// "A candidate", with no `firstName` in the data, and the name is not read. A verified host is
// still told the name.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications, offers } from '@/db/schema';
import { newId } from '@/lib/ids';
import type { Member } from '@/modules/orgs';
import type { VerificationStatus } from '@/modules/verification';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedMember, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { notifyOfferResponse } from './offers';

const names = vi.hoisted(() => ({ getCommunityIdentities: vi.fn() }));

vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  getCommunityIdentities: names.getCommunityIdentities,
}));

let t: TestDb;
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;
const ANSWERS = [
  [true, 'A candidate accepted your offer', 'Maya accepted your offer'],
  [false, 'A candidate declined your offer', 'Maya declined your offer'],
] as const;

type Note = typeof notifications.$inferSelect;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
  names.getCommunityIdentities.mockReset();
  names.getCommunityIdentities.mockImplementation(async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { displayName: 'Maya Rodriguez', firstName: 'Maya', lastInitial: 'R', avatarMediaId: null }])),
  );
});

function member(userId: string, membershipId: string, role: Member['role']): Member {
  return { membershipId, userId, displayName: null, email: null, role, scope: null, joinedAt: new Date('2026-01-01') };
}

/**
 * A sent offer to a seeker named Maya, from the owner, on a listing whose team also notifies an
 * admin. The org's verification is `verification` from here on.
 */
async function offered(verification: VerificationStatus) {
  const org = await seedHostOrg(t.db);
  const admin = await seedMember(t.db, org.orgId, 'admin');
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', notifyMemberIds: [admin.membershipId] });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  orgsFake.setMembers(org.orgId, [
    member(org.owner.userId, newId(), 'owner'),
    member(admin.userId, admin.membershipId, 'admin'),
  ]);
  orgsFake.setAccess(admin.userId, { all: true });
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'offered',
  });
  const offerId = await seedOffer(t.db, {
    orgId: org.orgId,
    listingId,
    applicationId,
    threadId: newId(),
    createdBy: org.owner.userId,
    position: 'Deckhand',
  });
  const [row] = await t.db.select().from(offers).where(eq(offers.id, offerId));
  if (!row) throw new Error('expected the offer');
  orgsFake.setOrgVerification(org.orgId, verification);
  names.getCommunityIdentities.mockClear();
  return { org, admin, seeker, offerId, row };
}

async function only(userId: string): Promise<Note> {
  const rows = (await t.db.select().from(notifications).where(eq(notifications.userId, userId))).filter(
    (row) => row.type === 'hiring.offer_response',
  );
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error('expected one hiring.offer_response');
  return row;
}

describe('the offer answer notice, to a refused host', () => {
  it.each(REFUSED.flatMap((status) => ANSWERS.map(([accepted, title]) => [status, accepted, title] as const)))(
    'while verification is %s (accepted: %s), every host recipient is told "%s" without the name',
    async (status, accepted, title) => {
      const s = await offered(status);

      await notifyOfferResponse(t.db, s.row, s.seeker.userId, accepted);

      for (const userId of [s.org.owner.userId, s.admin.userId]) {
        const note = await only(userId);
        expect(note.title).toBe(title);
        expect(note.data).toMatchObject({ offerId: s.offerId, audience: 'host', position: 'Deckhand', accepted });
        expect(note.data).not.toHaveProperty('firstName');
        expect(JSON.stringify({ title: note.title, body: note.body, data: note.data })).not.toMatch(/Maya|Rodriguez/);
      }
      expect(names.getCommunityIdentities).not.toHaveBeenCalled();
    },
  );

  it.each(ANSWERS)('tells every verified host recipient the name (accepted: %s)', async (accepted, _title, verifiedTitle) => {
    const s = await offered('verified');

    await notifyOfferResponse(t.db, s.row, s.seeker.userId, accepted);

    for (const userId of [s.org.owner.userId, s.admin.userId]) {
      const note = await only(userId);
      expect(note.title).toBe(verifiedTitle);
      expect(note.data).toMatchObject({ audience: 'host', firstName: 'Maya', accepted });
    }
  });
});
