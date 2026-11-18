import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications, offers, pipelineEntries } from '@/db/schema';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { Member } from '@/modules/orgs';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp5';
import { releaseOfferNote } from './notes';
import { acceptOffer, cancelOffer, declineOffer, listSeekerOffers, sendOffer } from './offers';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...applicationsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...orgsFake,
}));

let t: TestDb;
const NOW = new Date('2026-11-03T17:00:00Z');

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
});

function member(userId: string, role: Member['role']): Member {
  return {
    membershipId: newId(),
    userId,
    displayName: null,
    email: null,
    role,
    scope: null,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

async function media(orgId: string, ownerUserId: string, kind: string, status: string, mime: string) {
  const id = newId();
  await t.db.execute(sql`
    insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
      declared_mime, detected_mime, size_bytes)
    values (${id}, ${ownerUserId}, ${orgId}, ${kind}, ${status}, 'media-private', ${id},
      ${mime}, ${mime}, 1000)
  `);
  return id;
}

async function interviewing() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const admin = await seedMember(t.db, org.orgId, 'admin');
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setAccess(admin.userId, { all: true });
  orgsFake.setMembers(org.orgId, [member(org.owner.userId, 'owner'), member(admin.userId, 'admin')]);
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge');
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'interviewing',
  });
  return { org, seeker, admin, listingId, applicationId };
}

const pay = { amountCents: 2200, unit: 'hour' as const };

describe('sendOffer', () => {
  it('offers an interviewing application and refuses a second open offer', async () => {
    const { org, applicationId } = await interviewing();
    const view = await sendOffer(
      t.db as Db,
      org.owner.ctx,
      applicationId,
      { startDate: '2026-11-04', pay },
      NOW,
    );
    expect(view.priorStatus).toBe('interviewing');
    expect(view.position).toBe('Deckhand');
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('offered');
    expect(entry?.offerState).toBe('sent');
    await expect(
      sendOffer(t.db as Db, org.owner.ctx, applicationId, { startDate: '2026-11-04', pay }, NOW),
    ).rejects.toMatchObject({ details: { reason: 'offer_open' } });
  });

  it('refuses a letter that is not an approved PDF owned by this org', async () => {
    const { org, applicationId } = await interviewing();
    const other = await seedHostOrg(t.db);
    const scanning = await media(org.orgId, org.owner.userId, 'attachment', 'scanning', 'application/pdf');
    const foreign = await media(other.orgId, other.owner.userId, 'attachment', 'approved', 'application/pdf');
    const resume = await media(org.orgId, org.owner.userId, 'resume', 'approved', 'application/pdf');
    const image = await media(org.orgId, org.owner.userId, 'attachment', 'approved', 'image/png');
    for (const letterMediaId of [scanning, foreign, resume, image, newId()]) {
      await expect(
        sendOffer(t.db as Db, org.owner.ctx, applicationId, { startDate: '2026-11-04', pay, letterMediaId }, NOW),
      ).rejects.toMatchObject({ details: { reason: 'letter_not_ready' } });
    }
  });

  it('rejects a start date before today in the listing timezone', async () => {
    const { org, applicationId } = await interviewing();
    await expect(
      sendOffer(t.db as Db, org.owner.ctx, applicationId, { startDate: '2026-11-02', pay }, NOW),
    ).rejects.toMatchObject({ details: { reason: 'start_in_past' } });
  });

  it('hides a blocked note and delivers a warning the seeker can accept', async () => {
    const held = await interviewing();
    const view = await sendOffer(
      t.db as Db,
      held.org.owner.ctx,
      held.applicationId,
      { startDate: '2026-11-04', pay, note: 'do __block__ this' },
      NOW,
    );
    expect((await listSeekerOffers(t.db, held.seeker.userId)).items.map((item) => item.id)).not.toContain(view.id);
    await expect(acceptOffer(t.db as Db, held.seeker.userId, view.id, NOW)).rejects.toMatchObject({
      details: { reason: 'not_found' },
    });
    await expect(declineOffer(t.db as Db, held.seeker.userId, view.id, NOW)).rejects.toMatchObject({
      details: { reason: 'not_found' },
    });
    expect(messagingFake.calls.some((call) => call.name === 'postCard')).toBe(false);
    await withTx(t.db as Db, (tx) => releaseOfferNote(tx, view.id, { state: 'held', checkId: newId(), labels: [] }));
    expect((await listSeekerOffers(t.db, held.seeker.userId)).items.map((item) => item.id)).not.toContain(view.id);

    const warned = await interviewing();
    messagingFake.reset();
    const warn = await sendOffer(
      t.db as Db,
      warned.org.owner.ctx,
      warned.applicationId,
      { startDate: '2026-11-04', pay, note: 'welcome aboard' },
      NOW,
    );
    await withTx(t.db as Db, (tx) => releaseOfferNote(tx, warn.id, { state: 'warn', checkId: newId(), labels: [] }));
    const listed = await listSeekerOffers(t.db, warned.seeker.userId);
    expect(listed.items.find((item) => item.id === warn.id)?.note).toBe('welcome aboard');
    const accepted = await acceptOffer(t.db as Db, warned.seeker.userId, warn.id, NOW);
    expect(accepted.applicationStatus).toBe('hired');
  });
});

describe('offer responses', () => {
  it('hires on accept and tells the creator and the listing team', async () => {
    const scene = await interviewing();
    const view = await sendOffer(
      t.db as Db,
      scene.org.owner.ctx,
      scene.applicationId,
      { startDate: '2026-11-04', pay, position: 'Lead Deckhand' },
      NOW,
    );
    // A position the host typed is scanned before the seeker sees the offer.
    expect(view.noteState).toBe('pending');
    await withTx(t.db as Db, (tx) => releaseOfferNote(tx, view.id, { state: 'clear', checkId: newId(), labels: [] }));
    const accepted = await acceptOffer(t.db as Db, scene.seeker.userId, view.id, NOW);
    expect(accepted.applicationStatus).toBe('hired');
    expect(accepted.offer.status).toBe('accepted');
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, scene.applicationId));
    expect(entry?.status).toBe('hired');
    expect(entry?.hiredSource).toBe('offer_accepted');
    const ownerNotes = await t.db.select().from(notifications).where(eq(notifications.userId, scene.org.owner.userId));
    const adminNotes = await t.db.select().from(notifications).where(eq(notifications.userId, scene.admin.userId));
    expect(ownerNotes.some((note) => note.type === 'hiring.offer_response')).toBe(true);
    expect(adminNotes.some((note) => note.type === 'hiring.offer_response')).toBe(true);
  });

  it('returns to interviewing on cancel and closes the offer before the seeker can accept', async () => {
    const scene = await interviewing();
    const view = await sendOffer(t.db as Db, scene.org.owner.ctx, scene.applicationId, { startDate: '2026-11-04', pay }, NOW);
    const canceled = await cancelOffer(t.db as Db, scene.org.owner.ctx, view.id, NOW);
    expect(canceled.priorStatus).toBe('interviewing');
    expect(canceled.status).toBe('canceled');
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, scene.applicationId));
    expect(entry?.status).toBe('interviewing');
    const [offer] = await t.db.select().from(offers).where(eq(offers.id, view.id));
    expect(offer?.priorStatus).toBe('interviewing');
    await expect(acceptOffer(t.db as Db, scene.seeker.userId, view.id, NOW)).rejects.toMatchObject({
      details: { reason: 'offer_closed' },
    });
  });
});
