// The invite sweep (SP5 plan Task 15, spec 6 `hiring.sweep`): sent invites expire 14 days after
// sending or once their listing stops being live, and a delivered invite gets one reminder 48
// hours before it expires.
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { invites, pipelineEvents } from '../schema';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { FIXED_NOW, seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));

import '../notification-types';
import { sweepInvites } from './sweep';

const SENT = FIXED_NOW;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EXPIRES = new Date(SENT.getTime() + 14 * DAY);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
});

async function setup(o: { scanState?: 'clear' | 'warn' | 'held' | 'pending' } = {}) {
  const org = await seedHostOrg(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId });
  const { userId } = await seedSeeker(t.db);
  const inviteId = await seedInvite(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: userId,
    sentBy: org.owner.userId,
    sentAt: SENT,
    expiresAt: EXPIRES,
    scanState: o.scanState ?? 'clear',
  });
  return { orgId: org.orgId, listingId, seekerUserId: userId, inviteId };
}

async function status(inviteId: string) {
  const [row] = await t.db.select().from(invites).where(eq(invites.id, inviteId));
  return row;
}

async function reminders(userId: string) {
  return queryRows<{ id: string }>(
    t.db,
    sql`select id from app.notifications where user_id = ${userId}::uuid and type = 'hiring.invite_expiring'`,
  );
}

describe('sweepInvites', () => {
  it('expires a sent invite 14 days after sending, with one event', async () => {
    const s = await setup();
    await sweepInvites(t.db, new Date(EXPIRES.getTime() - HOUR));
    expect((await status(s.inviteId))?.status).toBe('sent');
    await sweepInvites(t.db, EXPIRES);
    expect((await status(s.inviteId))?.status).toBe('expired');
    await sweepInvites(t.db, new Date(EXPIRES.getTime() + HOUR));
    const events = await t.db
      .select()
      .from(pipelineEvents)
      .where(and(eq(pipelineEvents.inviteId, s.inviteId), eq(pipelineEvents.kind, 'invite_expired')));
    expect(events.map((e) => e.actorType)).toEqual(['system']);
  });

  it('expires a sent invite at the next sweep once its listing closes', async () => {
    const s = await setup();
    listingsFake.setListing({ id: s.listingId, orgId: s.orgId, status: 'closed' });
    await sweepInvites(t.db, new Date(SENT.getTime() + DAY));
    expect((await status(s.inviteId))?.status).toBe('expired');
  });

  it('leaves answered invites alone', async () => {
    const s = await setup();
    await t.db.update(invites).set({ status: 'interested' }).where(eq(invites.id, s.inviteId));
    await sweepInvites(t.db, new Date(EXPIRES.getTime() + DAY));
    expect((await status(s.inviteId))?.status).toBe('interested');
  });

  it('reminds once at 48 hours before expiry, not at 49', async () => {
    const s = await setup();
    await sweepInvites(t.db, new Date(EXPIRES.getTime() - 49 * HOUR));
    expect(await reminders(s.seekerUserId)).toHaveLength(0);
    await sweepInvites(t.db, new Date(EXPIRES.getTime() - 48 * HOUR));
    expect(await reminders(s.seekerUserId)).toHaveLength(1);
    await sweepInvites(t.db, new Date(EXPIRES.getTime() - 47 * HOUR));
    expect(await reminders(s.seekerUserId)).toHaveLength(1);
    expect((await status(s.inviteId))?.expiringRemindedAt).toBeInstanceOf(Date);
  });

  it('never reminds about an undelivered invite', async () => {
    const held = await setup({ scanState: 'held' });
    const pending = await setup({ scanState: 'pending' });
    await sweepInvites(t.db, new Date(EXPIRES.getTime() - 24 * HOUR));
    expect(await reminders(held.seekerUserId)).toHaveLength(0);
    expect(await reminders(pending.seekerUserId)).toHaveLength(0);
  });
});
