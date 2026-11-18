import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, offers } from '@/db/schema';
import { newId } from '@/lib/ids';
import type { HostInviteItem, SeekerInviteItem } from '@/lib/hiring';
import type { ThreadCard, ThreadViewer } from '@/modules/messaging';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { getCardPayloads } from './cards';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...applicationsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...orgsFake,
}));
vi.mock('@/modules/hiring/invites/reads', () => ({
  seekerInviteItems: vi.fn(async (_db: unknown, _userId: string, ids: string[]) => {
    const map = new Map<string, SeekerInviteItem>();
    for (const id of ids) {
      map.set(id, {
        inviteId: id,
        listingId: id,
        orgId: id,
        orgName: 'Kettle Ridge',
        orgLogoUrl: null,
        title: 'Deckhand',
        note: null,
        warn: false,
        status: 'sent',
        sentAt: '2026-11-03T17:00:00.000Z',
        expiresAt: '2026-11-17T17:00:00.000Z',
        threadId: null,
        applyHref: '/apply',
      });
    }
    return map;
  }),
  hostInviteItems: vi.fn(async (_db: unknown, _ctx: unknown, ids: string[]) => {
    const map = new Map<string, HostInviteItem>();
    for (const id of ids) {
      map.set(id, {
        inviteId: id,
        listingId: id,
        listingTitle: 'Deckhand',
        candidateId: id,
        firstName: 'Maya',
        lastInitial: 'C',
        status: 'sent',
        declineReason: null,
        sentAt: '2026-11-03T17:00:00.000Z',
        expiresAt: '2026-11-17T17:00:00.000Z',
        respondedAt: null,
        threadId: null,
      });
    }
    return map;
  }),
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
  orgsFake.reset();
});

describe('getCardPayloads', () => {
  it('shows host views in scope and seeker views, including a shortlisted application as applied', async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const stranger = await seedSeeker(t.db);
    const listingId = newId();
    const otherListing = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand' });
    listingsFake.setListing({ id: otherListing, orgId: other.orgId, title: 'Other' });
    orgsFake.setAccess(org.owner.userId, { all: true });
    orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'shortlisted',
    });
    const otherApplication = await seedEntry(t.db, {
      orgId: other.orgId,
      listingId: otherListing,
      seekerUserId: stranger.userId,
      status: 'shortlisted',
    });
    const threadId = newId();
    const interviewId = await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId,
      organizerUserId: org.owner.userId,
    });
    await t.db.update(interviews).set({ note: 'bring boots', scanState: 'warn' }).where(eq(interviews.id, interviewId));
    const offerId = await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId,
      createdBy: org.owner.userId,
    });
    const inviteId = newId();
    const cards: ThreadCard[] = [
      { type: 'application', refId: applicationId },
      { type: 'invite', refId: inviteId },
      { type: 'interview', refId: interviewId },
      { type: 'offer', refId: offerId },
      { type: 'application', refId: otherApplication },
    ];
    const host: ThreadViewer = { kind: 'host', ctx: org.owner.ctx };
    const hostPayloads = await getCardPayloads(t.db, { viewer: host, cards });
    expect(hostPayloads[interviewId]).toMatchObject({ type: 'interview', interview: { noteState: 'warn' } });
    expect(hostPayloads[applicationId]).toMatchObject({ type: 'application', status: 'shortlisted', title: 'Deckhand' });
    expect(hostPayloads[otherApplication]).toBeUndefined();
    expect(hostPayloads[inviteId]).toMatchObject({ type: 'invite' });
    expect(hostPayloads[offerId]).toMatchObject({ type: 'offer' });

    const seekerViewer: ThreadViewer = { kind: 'seeker', userId: seeker.userId };
    const seekerPayloads = await getCardPayloads(t.db, { viewer: seekerViewer, cards });
    expect(seekerPayloads[applicationId]).toMatchObject({ type: 'application', status: 'applied' });
    expect(seekerPayloads[interviewId]).toMatchObject({ type: 'interview', interview: { note: 'bring boots' } });
    expect(seekerPayloads[offerId]).toMatchObject({ type: 'offer' });
    expect(seekerPayloads[otherApplication]).toBeUndefined();

    const heldApp = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'interviewing',
    });
    const heldOfferApp = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'offered',
    });
    const heldInterview = await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: heldApp,
      threadId,
      organizerUserId: org.owner.userId,
    });
    await t.db.update(interviews).set({ scanState: 'held', note: 'hidden' }).where(eq(interviews.id, heldInterview));
    const heldOffer = await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: heldOfferApp,
      threadId: newId(),
      createdBy: org.owner.userId,
    });
    await t.db.update(offers).set({ scanState: 'held', note: 'hidden' }).where(eq(offers.id, heldOffer));
    const more: ThreadCard[] = [
      { type: 'interview', refId: heldInterview },
      { type: 'offer', refId: heldOffer },
    ];
    const hostHeld = await getCardPayloads(t.db, { viewer: host, cards: more });
    expect(hostHeld[heldInterview]).toMatchObject({ interview: { noteState: 'held' } });
    expect(hostHeld[heldOffer]).toMatchObject({ offer: { noteState: 'held' } });
    const seekerHeld = await getCardPayloads(t.db, { viewer: seekerViewer, cards: more });
    expect(seekerHeld[heldInterview]).toBeUndefined();
    expect(seekerHeld[heldOffer]).toBeUndefined();
  });
});
