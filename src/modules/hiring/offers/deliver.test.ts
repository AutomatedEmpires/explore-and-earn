// A scan-cleared offer from a host the applicant gate refuses (issue 234; review pass 3 on
// issue 198). The host was verified when it sent the offer, the scan held or was still reading
// the text, and the host was then moved to a refused status. Clearing the text must not deliver
// the offer: no card, no "offer received" notice, and the offer stays held so it can go out
// once the host is verified again. Messaging holds a message the same way (`releaseMessage`).
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications, offers } from '@/db/schema';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { VerificationStatus } from '@/modules/verification';
import { applicationsFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
import * as orgs from '@/modules/orgs';
import { releaseOfferNote } from './notes';
import { listSeekerOffers, sendOffer } from './offers';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
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
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

let t: TestDb;
const NOW = new Date('2026-11-03T17:00:00Z');
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;
const db = () => t.db as Db;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
  safetyFake.reset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** SP2 reports this verification status for this org (the fake reports `verified` otherwise). */
function verification(status: VerificationStatus, orgId: string): void {
  vi.spyOn(orgs, 'getOrgSummaries').mockImplementation(async (conn, ids) => {
    const out = await orgsFake.getOrgSummaries(conn, ids);
    const row = out.get(orgId);
    if (row) out.set(orgId, { ...row, verificationStatus: status });
    return out;
  });
}

/** An offer a verified host sent, whose text the scan has not cleared yet. */
async function pendingOffer() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'interviewing',
  });
  const view = await sendOffer(
    db(),
    org.owner.ctx,
    applicationId,
    { startDate: '2026-11-04', pay: { amountCents: 2200, unit: 'hour' }, note: 'welcome aboard' },
    NOW,
  );
  expect(view.noteState).toBe('pending');
  return { org, seeker, offerId: view.id };
}

function clear(offerId: string) {
  return withTx(db(), (tx) => releaseOfferNote(tx, offerId, { state: 'clear', checkId: newId(), labels: [] }));
}

async function scanStateOf(offerId: string) {
  const [row] = await t.db.select().from(offers).where(eq(offers.id, offerId));
  return row?.scanState;
}

async function receivedNotices(userId: string): Promise<number> {
  const rows = await t.db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.filter((row) => row.type === 'hiring.offer_received').length;
}

function cards(): number {
  return messagingFake.calls.filter((c) => c.name === 'postCard').length;
}

describe('a scan-cleared offer', () => {
  it.each(REFUSED)('is not delivered while the host is %s, and stays held', async (status) => {
    const s = await pendingOffer();
    verification(status, s.org.orgId);

    await clear(s.offerId);

    expect(cards()).toBe(0);
    expect(await receivedNotices(s.seeker.userId)).toBe(0);
    expect(await scanStateOf(s.offerId)).toBe('held');
    expect((await listSeekerOffers(t.db, s.seeker.userId)).items.map((item) => item.id)).not.toContain(s.offerId);
  });

  it('goes out on a later release, once the host is verified again', async () => {
    const s = await pendingOffer();
    verification('needs_review', s.org.orgId);
    await clear(s.offerId);
    expect(cards()).toBe(0);

    vi.restoreAllMocks();
    await clear(s.offerId);

    expect(cards()).toBe(1);
    expect(await receivedNotices(s.seeker.userId)).toBe(1);
    expect(await scanStateOf(s.offerId)).toBe('clear');
  });

  it('is delivered at once for a verified host', async () => {
    const s = await pendingOffer();
    await clear(s.offerId);
    expect(cards()).toBe(1);
    expect(await receivedNotices(s.seeker.userId)).toBe(1);
    expect(await scanStateOf(s.offerId)).toBe('clear');
  });
});
