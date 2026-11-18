import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { interviews, offers } from '@/db/schema';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry, seedHostOrg, seedInterview, seedInvite, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { pendingInboxCount } from './inbox';

let t: TestDb;
const NOW = new Date('2026-11-03T17:00:00Z');

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe('pendingInboxCount', () => {
  it('counts delivered invites, interviews and offers, and ignores the rest', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'interviewing',
    });
    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      scanState: 'clear',
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60_000),
    });
    await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'invited',
    });
    await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: newId(),
      createdBy: org.owner.userId,
    });
    expect(await pendingInboxCount(t.db, seeker.userId, NOW)).toBe(3);

    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId: newId(),
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      scanState: 'clear',
      expiresAt: new Date(NOW.getTime() - 60_000),
    });
    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId: newId(),
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      scanState: 'pending',
    });
    await seedInvite(t.db, {
      orgId: org.orgId,
      listingId: newId(),
      seekerUserId: seeker.userId,
      sentBy: org.owner.userId,
      scanState: 'held',
    });
    const heldApp = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'interviewing',
    });
    const pendingApp = await seedEntry(t.db, {
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
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'invited',
    });
    await t.db.update(interviews).set({ scanState: 'held' }).where(eq(interviews.id, heldInterview));
    const pendingInterview = await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: pendingApp,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'invited',
    });
    await t.db.update(interviews).set({ scanState: 'pending' }).where(eq(interviews.id, pendingInterview));
    const heldOffer = await seedOffer(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: heldOfferApp,
      threadId: newId(),
      createdBy: org.owner.userId,
    });
    await t.db.update(offers).set({ scanState: 'held' }).where(eq(offers.id, heldOffer));
    expect(await pendingInboxCount(t.db, seeker.userId, NOW)).toBe(3);

    const second = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'interviewing',
    });
    const warn = await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId: second,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'invited',
    });
    await t.db.update(interviews).set({ scanState: 'warn' }).where(eq(interviews.id, warn));
    expect(await pendingInboxCount(t.db, seeker.userId, NOW)).toBe(4);
  });
});
