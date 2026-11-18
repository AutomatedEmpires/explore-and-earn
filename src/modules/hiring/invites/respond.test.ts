// Invite answers and lists (SP5 plan Task 15, spec 8.4): Interested opens the thread and the
// staged reveal, Not interested carries a reason the host sees, Mute host answers Not
// interested, repeated answers are idempotent, expiry is read before the sweep, and pending or
// held invites never reach the seeker.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { sql } from 'drizzle-orm';
import type { HostContext } from '@/server/guards';
import { pipelineEvents } from '../schema';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { discoveryFake } from '@tests/fakes/sp5/sp3';
import { profilesFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { FIXED_NOW, seedHostOrg, seedInvite, seedSeeker } from '@tests/helpers/sp5';

const mocks = vi.hoisted(() => ({ getCommunityIdentities: vi.fn() }));

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
  ...(await import('@tests/fakes/sp5/sp4')).profilesFake,
  getCommunityIdentities: mocks.getCommunityIdentities,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));
vi.mock('@/modules/discovery', async (orig) => ({
  ...(await orig<typeof import('@/modules/discovery')>()),
  ...(await import('@tests/fakes/sp5/sp3')).discoveryFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));

import '../notification-types';
import { getSeekerInvite, listHostInvites, listSeekerInvites } from './reads';
import { muteInviteHost, respondToInvite } from './respond';

const NOW = FIXED_NOW;
const DAY = 86_400_000;

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
  profilesFake.reset();
  safetyFake.reset();
  discoveryFake.reset();
  messagingFake.reset();
  mocks.getCommunityIdentities.mockReset();
  mocks.getCommunityIdentities.mockImplementation(async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { displayName: 'Maya Rodriguez', firstName: 'Maya', lastInitial: 'R', avatarMediaId: null }])),
  );
});

type Setup = { ctx: HostContext; orgId: string; senderId: string; listingId: string; seekerUserId: string };

async function setup(): Promise<Setup> {
  const org = await seedHostOrg(t.db);
  orgsFake.setAccess(org.owner.userId, { all: true });
  orgsFake.setOrgName(org.orgId, 'Kettle Ridge Lodge');
  orgsFake.setMembers(org.orgId, [
    {
      membershipId: org.owner.membershipId,
      userId: org.owner.userId,
      displayName: 'Sam Rivera',
      email: org.owner.email,
      role: 'owner',
      scope: null,
      joinedAt: new Date(0),
    },
  ]);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, publishedRevisionId: newId() });
  const { userId } = await seedSeeker(t.db);
  return { ctx: org.owner.ctx, orgId: org.orgId, senderId: org.owner.userId, listingId, seekerUserId: userId };
}

async function invite(s: Setup, o: Partial<Parameters<typeof seedInvite>[1]> = {}): Promise<string> {
  return seedInvite(t.db, { orgId: s.orgId, listingId: s.listingId, seekerUserId: s.seekerUserId, sentBy: s.senderId, ...o });
}

async function responses(userId: string) {
  return queryRows<{ title: string; data: Record<string, unknown> }>(
    t.db,
    sql`select title, data from app.notifications where user_id = ${userId}::uuid and type = 'hiring.invite_response'`,
  );
}

const calls = (name: string) => messagingFake.calls.filter((c) => c.name === name).map((c) => c.args);

describe('respondToInvite', () => {
  it('opens the thread, reveals the seeker to the org and tells the sender on Interested', async () => {
    const s = await setup();
    const inviteId = await invite(s);
    const r = await respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'interested' }, NOW);
    expect(r.threadId).toEqual(expect.any(String));
    expect(r.invite).toMatchObject({
      status: 'interested',
      threadId: r.threadId,
      orgName: 'Kettle Ridge Lodge',
      title: 'Lift Operator',
      applyHref: `/apply/${s.listingId}?source=invite&invite=${inviteId}`,
    });
    expect(calls('ensureThread')).toEqual([
      [{ orgId: s.orgId, listingId: s.listingId, seekerUserId: s.seekerUserId, inviteId }],
    ]);
    expect(calls('postCard')).toEqual([[r.threadId, { type: 'invite', refId: inviteId }, null]]);
    expect(calls('postEvent')).toEqual([[r.threadId, { code: 'invite_interested', visibleTo: 'all' }]]);
    expect(profilesFake.calls.filter((c) => c.name === 'grantReveal').map((c) => c.args[0])).toEqual([
      { seekerUserId: s.seekerUserId, orgId: s.orgId, reason: 'invite_interested', sourceId: inviteId },
    ]);
    const events = await t.db
      .select()
      .from(pipelineEvents)
      .where(and(eq(pipelineEvents.inviteId, inviteId), eq(pipelineEvents.kind, 'invite_interested')));
    expect(events).toHaveLength(1);
    expect(events[0]?.actorType).toBe('seeker');
    const told = await responses(s.senderId);
    expect(told).toHaveLength(1);
    expect(told[0]?.title).toBe('Maya is interested');
    expect(told[0]?.data).toMatchObject({ inviteId, interested: true, audience: 'host', url: `/host/messages/${r.threadId}` });
  });

  it('returns the recorded answer when Interested is repeated, and refuses a different one', async () => {
    const s = await setup();
    const inviteId = await invite(s);
    const first = await respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'interested' }, NOW);
    const again = await respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'interested' }, NOW);
    expect(again.threadId).toBe(first.threadId);
    expect(calls('ensureThread')).toHaveLength(1);
    expect(await responses(s.senderId)).toHaveLength(1);
    await expect(
      respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'not_interested' }, NOW),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'already_responded' } });
  });

  it('records a Not interested reason the host sees', async () => {
    const s = await setup();
    const inviteId = await invite(s);
    const r = await respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'not_interested', reason: 'pay' }, NOW);
    expect(r).toMatchObject({ threadId: null, invite: { status: 'not_interested' } });
    const host = await listHostInvites(t.db, s.ctx, {}, NOW);
    expect(host.items.find((i) => i.inviteId === inviteId)).toMatchObject({
      status: 'not_interested',
      declineReason: 'pay',
      firstName: 'Maya',
      lastInitial: 'R',
    });
    const told = await responses(s.senderId);
    expect(told[0]?.title).toBe("Maya isn't interested");
    expect(calls('ensureThread')).toHaveLength(0);
  });

  it('refuses an answer after expiry before the sweep, and lists the invite as expired', async () => {
    const s = await setup();
    const inviteId = await invite(s, { sentAt: new Date(NOW.getTime() - 15 * DAY), expiresAt: new Date(NOW.getTime() - DAY) });
    await expect(
      respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'interested' }, NOW),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'expired' } });
    const list = await listSeekerInvites(t.db, s.seekerUserId, {}, NOW);
    expect(list.items.find((i) => i.inviteId === inviteId)?.status).toBe('expired');
  });

  it("is 404 for another seeker's invite", async () => {
    const s = await setup();
    const inviteId = await invite(s);
    const { userId: other } = await seedSeeker(t.db);
    await expect(respondToInvite(t.db, other, inviteId, { response: 'interested' }, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('notifies the listing team when the sender has left the org', async () => {
    const s = await setup();
    const { userId: departed } = await seedSeeker(t.db);
    const inviteId = await seedInvite(t.db, {
      orgId: s.orgId,
      listingId: s.listingId,
      seekerUserId: s.seekerUserId,
      sentBy: departed,
    });
    await respondToInvite(t.db, s.seekerUserId, inviteId, { response: 'not_interested' }, NOW);
    expect(await responses(departed)).toHaveLength(0);
    expect(await responses(s.senderId)).toHaveLength(1);
  });
});

describe('muteInviteHost', () => {
  it('mutes the org and answers Not interested with no reason', async () => {
    const s = await setup();
    const inviteId = await invite(s);
    const r = await muteInviteHost(t.db, s.seekerUserId, inviteId, NOW);
    expect(safetyFake.calls.filter((c) => c.name === 'mute').map((c) => c.args[0])).toEqual([
      { userId: s.seekerUserId, orgId: s.orgId },
    ]);
    expect(r.invite).toMatchObject({ status: 'not_interested' });
    const host = await listHostInvites(t.db, s.ctx, {}, NOW);
    expect(host.items.find((i) => i.inviteId === inviteId)).toMatchObject({ status: 'not_interested', declineReason: null });
  });
});

describe('invite lists', () => {
  it('hides pending and held invites from the seeker and shows the host Not delivered', async () => {
    const s = await setup();
    const pending = await invite(s, { scanState: 'pending', note: 'Hi' });
    const listing2 = newId();
    listingsFake.setListing({ id: listing2, orgId: s.orgId });
    const held = await seedInvite(t.db, {
      orgId: s.orgId,
      listingId: listing2,
      seekerUserId: s.seekerUserId,
      sentBy: s.senderId,
      scanState: 'held',
      note: 'Pay a fee',
    });
    const listing3 = newId();
    listingsFake.setListing({ id: listing3, orgId: s.orgId });
    const warned = await seedInvite(t.db, {
      orgId: s.orgId,
      listingId: listing3,
      seekerUserId: s.seekerUserId,
      sentBy: s.senderId,
      scanState: 'warn',
      note: 'Text me',
    });
    const seeker = await listSeekerInvites(t.db, s.seekerUserId, {}, NOW);
    expect(seeker.items.map((i) => i.inviteId)).toEqual([warned]);
    expect(seeker.items[0]).toMatchObject({ warn: true, note: 'Text me' });
    await expect(getSeekerInvite(t.db, s.seekerUserId, pending, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getSeekerInvite(t.db, s.seekerUserId, held, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(respondToInvite(t.db, s.seekerUserId, held, { response: 'interested' }, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });

    const host = await listHostInvites(t.db, s.ctx, {}, NOW);
    const by = (id: string) => host.items.find((i) => i.inviteId === id)?.status;
    expect(by(held)).toBe('not_delivered');
    expect(by(pending)).toBe('sent');
    expect(by(warned)).toBe('sent');
    expect(JSON.stringify(host)).not.toContain('Pay a fee');
  });

  it('adds the job card while the listing is live', async () => {
    const s = await setup();
    const inviteId = await invite(s);
    discoveryFake.setJobCard(s.listingId, { listingId: s.listingId, title: 'Lift Operator' } as never);
    const live = await getSeekerInvite(t.db, s.seekerUserId, inviteId, NOW);
    expect(live.jobCard).toMatchObject({ listingId: s.listingId });
    listingsFake.setListing({ id: s.listingId, orgId: s.orgId, status: 'closed' });
    expect((await getSeekerInvite(t.db, s.seekerUserId, inviteId, NOW)).jobCard).toBeNull();
  });

  it('pages the host list newest first and filters by status', async () => {
    const s = await setup();
    const ids: string[] = [];
    for (let k = 0; k < 27; k += 1) {
      const listingId = newId();
      listingsFake.setListing({ id: listingId, orgId: s.orgId });
      const { userId } = await seedSeeker(t.db);
      ids.push(
        await seedInvite(t.db, {
          orgId: s.orgId,
          listingId,
          seekerUserId: userId,
          sentBy: s.senderId,
          sentAt: new Date(NOW.getTime() - k * 60_000),
        }),
      );
    }
    const first = await listHostInvites(t.db, s.ctx, {}, NOW);
    expect(first.items.map((i) => i.inviteId)).toEqual(ids.slice(0, 25));
    const second = await listHostInvites(t.db, s.ctx, { cursor: first.nextCursor ?? undefined }, NOW);
    expect(second.items.map((i) => i.inviteId)).toEqual(ids.slice(25));
    expect(second.nextCursor).toBeNull();
    const none = await listHostInvites(t.db, s.ctx, { status: 'interested' }, NOW);
    expect(none.items).toEqual([]);
    await expect(
      listHostInvites(t.db, s.ctx, { status: 'sent', cursor: first.nextCursor ?? undefined }, NOW),
    ).rejects.toMatchObject({ code: 'bad_request', details: { reason: 'invalid_cursor' } });
    await expect(
      listSeekerInvites(t.db, s.seekerUserId, { cursor: first.nextCursor ?? undefined }, NOW),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('scopes the host list to listings a Recruiter can see', async () => {
    const s = await setup();
    await invite(s);
    orgsFake.setAccess(s.senderId, { all: false, listingIds: [], locationIds: [] });
    expect((await listHostInvites(t.db, s.ctx, {}, NOW)).items).toEqual([]);
    await expect(listHostInvites(t.db, s.ctx, { listingId: s.listingId }, NOW)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
