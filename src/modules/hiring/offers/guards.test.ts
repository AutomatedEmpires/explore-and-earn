// The review of PR 178 (issue 186) for offers: blocks, the scan of the position, and held offers.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications, offers, pipelineEntries } from '@/db/schema';
import { withTx, type Db } from '@/lib/db';
import type { OfferInput } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { applicationsFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
import { runNoteScan } from '../notes';
import { loadOfferNote, releaseOfferNote } from './notes';
import { cancelOffer, listSeekerOffers, sendOffer } from './offers';

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
const pay = { amountCents: 2200, unit: 'hour' as const };
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

async function interviewing() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'interviewing',
  });
  return { org, seeker, listingId, applicationId, ctx: org.owner.ctx };
}

function send(s: Awaited<ReturnType<typeof interviewing>>, extra: Partial<OfferInput> = {}) {
  return sendOffer(db(), s.ctx, s.applicationId, { startDate: '2026-11-04', pay, ...extra }, NOW);
}

async function typesFor(userId: string): Promise<string[]> {
  const rows = await t.db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.map((row) => row.type);
}

function named(name: string) {
  return messagingFake.calls.filter((call) => call.name === name);
}

describe('a block between the seeker and the org', () => {
  it('refuses an offer: no offer, card or notification, and the thread is stamped', async () => {
    const s = await interviewing();
    const { threadId } = await withTx(db(), (tx) =>
      messagingFake.ensureThread(tx, {
        orgId: s.org.orgId,
        listingId: s.listingId,
        seekerUserId: s.seeker.userId,
        applicationId: s.applicationId,
      }),
    );
    messagingFake.calls.length = 0;
    safetyFake.setBlocked(s.org.orgId, s.seeker.userId);

    await expect(send(s)).rejects.toMatchObject({ code: 'conflict', details: { reason: 'read_only' } });

    expect(await t.db.select().from(offers).where(eq(offers.applicationId, s.applicationId))).toHaveLength(0);
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, s.applicationId));
    expect(entry?.status).toBe('interviewing');
    expect(entry?.offerState).toBeNull();
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(s.seeker.userId)).not.toContain('hiring.offer_received');
    expect(named('setThreadReadOnly').map((call) => call.args.slice(0, 2))).toEqual([[threadId, 'blocked']]);
  });

  it('sends nothing when the block lands while the text is still being scanned', async () => {
    const s = await interviewing();
    const view = await send(s, { note: 'welcome aboard' });
    safetyFake.setBlocked(s.org.orgId, s.seeker.userId);
    await withTx(db(), (tx) => releaseOfferNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }));
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(s.seeker.userId)).not.toContain('hiring.offer_received');
  });
});

describe('the scam scan covers the position', () => {
  it('holds an offer whose position is a scam, with no note', async () => {
    const s = await interviewing();
    const view = await send(s, { position: 'Deckhand, __block__ pay a deposit' });
    expect(view.noteState).toBe('pending');
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(s.seeker.userId)).not.toContain('hiring.offer_received');

    await runNoteScan(db(), { subjectType: 'offer', subjectId: view.id });

    const [row] = await t.db.select().from(offers).where(eq(offers.id, view.id));
    expect(row?.scanState).toBe('held');
    expect((await listSeekerOffers(t.db, s.seeker.userId)).items.map((item) => item.id)).not.toContain(view.id);
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(s.seeker.userId)).not.toContain('hiring.offer_received');
  });

  it('scans the position together with the note', async () => {
    const s = await interviewing();
    const view = await send(s, { position: 'Lead Deckhand', note: 'welcome aboard' });
    const loaded = await loadOfferNote(t.db, view.id);
    expect(loaded?.text).toContain('Lead Deckhand');
    expect(loaded?.text).toContain('welcome aboard');
  });

  it('delivers at once when the position is the listing title and there is no note', async () => {
    const s = await interviewing();
    const view = await send(s);
    expect(view.noteState).toBe('clear');
    expect(named('postCard')).toHaveLength(1);
    expect(await typesFor(s.seeker.userId)).toContain('hiring.offer_received');

    const same = await interviewing();
    const again = await send(same, { position: '  Deckhand ' });
    expect(again.noteState).toBe('clear');
  });
});

describe('a held offer', () => {
  it('sends nothing on approval once the offer was canceled', async () => {
    const s = await interviewing();
    const view = await send(s, { note: 'welcome aboard' });
    await t.db.update(offers).set({ status: 'canceled', scanState: 'held' }).where(eq(offers.id, view.id));

    await withTx(db(), (tx) => releaseOfferNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }));

    const [row] = await t.db.select().from(offers).where(eq(offers.id, view.id));
    expect(row?.scanState).toBe('clear');
    expect(named('postCard')).toHaveLength(0);
    expect(await typesFor(s.seeker.userId)).not.toContain('hiring.offer_received');
  });

  it('keeps its cancel event from the seeker', async () => {
    const s = await interviewing();
    const view = await send(s, { note: 'do __block__ this' });
    await cancelOffer(db(), s.ctx, view.id, NOW);
    expect(named('postEvent').map((call) => call.args[1])).toEqual([{ code: 'offer_canceled', visibleTo: 'host' }]);
  });

  it('still shows the cancel of a delivered offer to both sides', async () => {
    const s = await interviewing();
    const view = await send(s);
    await cancelOffer(db(), s.ctx, view.id, NOW);
    expect(named('postEvent').map((call) => call.args[1])).toEqual([{ code: 'offer_canceled', visibleTo: 'all' }]);
  });
});
