import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications, offers } from '@/db/schema';
import { newId } from '@/lib/ids';
import type { Member } from '@/modules/orgs';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { envelope, seedEntry, seedHostOrg, seedInterview, seedMember, seedOffer, seedSeeker } from '@tests/helpers/sp5';
import { onMemberRemoved } from './close';
import { sweepInterviews } from './sweep';

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
const HOUR = 60 * 60_000;

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
});

function member(userId: string, role: Member['role'], joinedAt: string): Member {
  return {
    membershipId: newId(),
    userId,
    displayName: null,
    email: null,
    role,
    scope: null,
    joinedAt: new Date(joinedAt),
  };
}

async function row(status: 'invited' | 'scheduled', times: { expiresAt?: Date; start?: Date; end?: Date }) {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status: 'interviewing',
  });
  const interviewId = await seedInterview(t.db, {
    orgId: org.orgId,
    listingId,
    applicationId,
    threadId: newId(),
    organizerUserId: org.owner.userId,
    status,
  });
  await t.db
    .update(interviews)
    .set({
      status,
      expiresAt: times.expiresAt ?? null,
      scheduledStart: times.start ?? null,
      scheduledEnd: times.end ?? null,
    })
    .where(eq(interviews.id, interviewId));
  return { org, seeker, listingId, applicationId, interviewId };
}

describe('sweepInterviews', () => {
  it('expires, completes, nudges once, and leaves a closed listing alone', async () => {
    const expired = await row('invited', { expiresAt: new Date(NOW.getTime() - HOUR) });
    orgsFake.setMembers(expired.org.orgId, [member(expired.org.owner.userId, 'owner', '2026-01-01T00:00:00Z')]);
    await sweepInterviews(t.db, NOW);
    const [expiredRow] = await t.db.select().from(interviews).where(eq(interviews.id, expired.interviewId));
    expect(expiredRow?.status).toBe('expired');
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, expired.org.owner.userId));
    expect(notes.filter((note) => note.type === 'hiring.interview_expired')).toHaveLength(1);

    const old = await row('scheduled', {
      start: new Date(NOW.getTime() - 50 * HOUR),
      end: new Date(NOW.getTime() - 49 * HOUR),
    });
    orgsFake.setMembers(old.org.orgId, [member(old.org.owner.userId, 'owner', '2026-01-01T00:00:00Z')]);
    await sweepInterviews(t.db, NOW);
    const [done] = await t.db.select().from(interviews).where(eq(interviews.id, old.interviewId));
    expect(done?.status).toBe('completed');

    const ended = await row('scheduled', {
      start: new Date(NOW.getTime() - 2 * HOUR),
      end: new Date(NOW.getTime() - HOUR),
    });
    orgsFake.setMembers(ended.org.orgId, [member(ended.org.owner.userId, 'owner', '2026-01-01T00:00:00Z')]);
    await sweepInterviews(t.db, NOW);
    await sweepInterviews(t.db, NOW);
    const nudges = await t.db.select().from(notifications).where(eq(notifications.userId, ended.org.owner.userId));
    expect(nudges.filter((note) => note.type === 'hiring.interview_outcome_due')).toHaveLength(1);

    const closed = await row('scheduled', {
      start: new Date(NOW.getTime() + 24 * HOUR),
      end: new Date(NOW.getTime() + 25 * HOUR),
    });
    listingsFake.setListing({ id: closed.listingId, orgId: closed.org.orgId, status: 'closed', title: 'Deckhand' });
    orgsFake.setMembers(closed.org.orgId, [member(closed.org.owner.userId, 'owner', '2026-01-01T00:00:00Z')]);
    const offerId = await seedOffer(t.db, {
      orgId: closed.org.orgId,
      listingId: closed.listingId,
      applicationId: closed.applicationId,
      threadId: newId(),
      createdBy: closed.org.owner.userId,
    });
    await sweepInterviews(t.db, NOW);
    const [still] = await t.db.select().from(interviews).where(eq(interviews.id, closed.interviewId));
    const [offer] = await t.db.select().from(offers).where(eq(offers.id, offerId));
    expect(still?.status).toBe('scheduled');
    expect(offer?.status).toBe('sent');
  });

  it('reassigns a missing organizer to the earliest admin, else the owner', async () => {
    const gone = await seedSeeker(t.db);
    const first = await row('invited', { expiresAt: new Date(NOW.getTime() + 48 * HOUR) });
    const early = await seedMember(t.db, first.org.orgId, 'admin');
    const later = await seedMember(t.db, first.org.orgId, 'admin');
    await t.db.update(interviews).set({ organizerUserId: gone.userId }).where(eq(interviews.id, first.interviewId));
    orgsFake.setMembers(first.org.orgId, [
      member(later.userId, 'admin', '2026-06-01T00:00:00Z'),
      member(early.userId, 'admin', '2026-01-01T00:00:00Z'),
      member(first.org.owner.userId, 'owner', '2025-01-01T00:00:00Z'),
    ]);
    await sweepInterviews(t.db, NOW);
    const [moved] = await t.db.select().from(interviews).where(eq(interviews.id, first.interviewId));
    expect(moved?.organizerUserId).toBe(early.userId);

    const ownerOnly = await row('invited', { expiresAt: new Date(NOW.getTime() + 48 * HOUR) });
    await t.db.update(interviews).set({ organizerUserId: gone.userId }).where(eq(interviews.id, ownerOnly.interviewId));
    orgsFake.setMembers(ownerOnly.org.orgId, [member(ownerOnly.org.owner.userId, 'owner', '2025-01-01T00:00:00Z')]);
    await sweepInterviews(t.db, NOW);
    const [toOwner] = await t.db.select().from(interviews).where(eq(interviews.id, ownerOnly.interviewId));
    expect(toOwner?.organizerUserId).toBe(ownerOnly.org.owner.userId);
  });

  it('follows org.member_removed to the named admin', async () => {
    const removed = await seedSeeker(t.db);
    const current = await row('scheduled', {
      start: new Date(NOW.getTime() + HOUR),
      end: new Date(NOW.getTime() + 2 * HOUR),
    });
    const admin = await seedMember(t.db, current.org.orgId, 'admin');
    await t.db.update(interviews).set({ organizerUserId: removed.userId }).where(eq(interviews.id, current.interviewId));
    orgsFake.setMembers(current.org.orgId, [
      member(admin.userId, 'admin', '2026-02-01T00:00:00Z'),
      member(current.org.owner.userId, 'owner', '2025-01-01T00:00:00Z'),
    ]);
    await onMemberRemoved(
      t.db,
      envelope('org.member_removed', {
        orgId: current.org.orgId,
        userId: removed.userId,
        reassignToUserId: admin.userId,
      }),
    );
    const [rowAfter] = await t.db.select().from(interviews).where(eq(interviews.id, current.interviewId));
    expect(rowAfter?.organizerUserId).toBe(admin.userId);
  });
});
