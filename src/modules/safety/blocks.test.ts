// Blocks, mutes, relationships and block sets (SP4 spec 8.7, plan Task 25): the refusals,
// idempotence, the unfollow on a block or mute, both directions of every read, and the audit
// rows. A party only ever lists the blocks it made itself.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { Party } from '@/lib/safety';
import { calls, resetSp2 } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOrg, seedUser } from '@tests/helpers/sp4';
import {
  block,
  blockedUserIdsForOrg,
  getBlockSet,
  getRelationships,
  isBlockedBetween,
  listBlocks,
  listMutes,
  mute,
  unblock,
  unblockById,
  unmute,
} from './index';

vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  resetSp2();
});

const user = (id: string): Party => ({ type: 'user', id });
const org = (id: string): Party => ({ type: 'org', id });

async function seeker(): Promise<string> {
  return (await seedUser(t.db, { accountType: 'seeker' })).id;
}

async function host(): Promise<{ orgId: string; memberId: string }> {
  const { orgId } = await seedOrg(t.db);
  const member = await seedUser(t.db, { accountType: 'host' });
  return { orgId, memberId: member.id };
}

async function blockRows(): Promise<number> {
  const [row] = await queryRows<{ n: number }>(t.db, sql`select count(*)::int as n from app.blocks`);
  return row?.n ?? 0;
}

async function audits(action: string, subjectId: string) {
  return queryRows<{ actor_id: string; org_id: string | null; data: unknown }>(
    t.db,
    sql`select actor_id, org_id, data from app.audit_events
        where action = ${action} and subject_id = ${subjectId}`,
  );
}

describe('block', () => {
  it('refuses org to org, and a party blocking itself', async () => {
    const a = await host();
    const b = await host();
    const s = await seeker();
    await expect(block(t.db, org(a.orgId), org(b.orgId), a.memberId)).rejects.toMatchObject({
      code: 'bad_request',
    });
    await expect(block(t.db, user(s), user(s), s)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(block(t.db, org(a.orgId), org(a.orgId), a.memberId)).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('is idempotent: blocking twice leaves one row', async () => {
    const s = await seeker();
    const h = await host();
    const before = await blockRows();
    const first = await block(t.db, user(s), org(h.orgId), s);
    const second = await block(t.db, user(s), org(h.orgId), s);
    expect(first.created).toBe(true);
    expect(second).toEqual({ blockId: first.blockId, created: false });
    expect(await blockRows()).toBe(before + 1);
  });

  it('refuses a target that does not exist', async () => {
    const s = await seeker();
    await expect(block(t.db, user(s), org(newId()), s)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(block(t.db, user(s), user(newId()), s)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('unfollows the org when a seeker blocks it, and when a seeker mutes it', async () => {
    const s = await seeker();
    const h = await host();
    await block(t.db, user(s), org(h.orgId), s);
    expect(calls.unfollow).toEqual([{ userId: s, orgId: h.orgId }]);
    const other = await host();
    await mute(t.db, { userId: s, orgId: other.orgId });
    expect(calls.unfollow).toEqual([
      { userId: s, orgId: h.orgId },
      { userId: s, orgId: other.orgId },
    ]);
  });

  it('does not unfollow anything when an org blocks a seeker', async () => {
    const s = await seeker();
    const h = await host();
    await block(t.db, org(h.orgId), user(s), h.memberId);
    expect(calls.unfollow).toEqual([]);
  });

  it('audits a new block once, with party types only', async () => {
    const s = await seeker();
    const h = await host();
    const { blockId } = await block(t.db, org(h.orgId), user(s), h.memberId);
    await block(t.db, org(h.orgId), user(s), h.memberId);
    expect(await audits('safety.block_created', blockId)).toEqual([
      { actor_id: h.memberId, org_id: h.orgId, data: { blockerType: 'org', blockedType: 'user' } },
    ]);

    // A seeker's block is never filed under the org it blocked.
    const mine = await block(t.db, user(s), org(h.orgId), s);
    expect(await audits('safety.block_created', mine.blockId)).toEqual([
      { actor_id: s, org_id: null, data: { blockerType: 'user', blockedType: 'org' } },
    ]);
  });
});

describe('unblock', () => {
  it('removes the block, audits it once, and changes nothing the second time', async () => {
    const s = await seeker();
    const h = await host();
    const { blockId } = await block(t.db, user(s), org(h.orgId), s);
    await unblock(t.db, user(s), org(h.orgId), s);
    await unblock(t.db, user(s), org(h.orgId), s);
    expect((await isBlockedBetween(t.db, user(s), org(h.orgId))).blocked).toBe(false);
    expect(await audits('safety.block_removed', blockId)).toHaveLength(1);
  });

  it('unblockById removes only a block the party made', async () => {
    const s = await seeker();
    const h = await host();
    const other = await host();
    const { blockId } = await block(t.db, org(h.orgId), user(s), h.memberId);
    await expect(
      unblockById(t.db, { blockId, by: org(other.orgId), actorUserId: other.memberId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      unblockById(t.db, { blockId, by: user(s), actorUserId: s }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await isBlockedBetween(t.db, org(h.orgId), user(s))).blocked).toBe(true);

    await unblockById(t.db, { blockId, by: org(h.orgId), actorUserId: h.memberId });
    expect((await isBlockedBetween(t.db, org(h.orgId), user(s))).blocked).toBe(false);
    expect(await audits('safety.block_removed', blockId)).toEqual([
      { actor_id: h.memberId, org_id: h.orgId, data: { blockerType: 'org', blockedType: 'user' } },
    ]);
    await expect(
      unblockById(t.db, { blockId, by: org(h.orgId), actorUserId: h.memberId }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('reads', () => {
  it('isBlockedBetween names the direction', async () => {
    const s = await seeker();
    const h = await host();
    await block(t.db, org(h.orgId), user(s), h.memberId);
    expect(await isBlockedBetween(t.db, user(s), org(h.orgId))).toEqual({
      blocked: true,
      byA: false,
      byB: true,
    });
    expect(await isBlockedBetween(t.db, org(h.orgId), user(s))).toEqual({
      blocked: true,
      byA: true,
      byB: false,
    });
    const free = await seeker();
    expect(await isBlockedBetween(t.db, user(free), org(h.orgId))).toEqual({
      blocked: false,
      byA: false,
      byB: false,
    });
  });

  it('getRelationships answers in input order, a block either way and the mute', async () => {
    const h = await host();
    const a = await seeker();
    const b = await seeker();
    const c = await seeker();
    const d = await seeker();
    await block(t.db, org(h.orgId), user(a), h.memberId);
    await mute(t.db, { userId: b, orgId: h.orgId });
    await block(t.db, user(c), org(h.orgId), c);
    // A block or mute with another org changes nothing here.
    const other = await host();
    await block(t.db, org(other.orgId), user(d), other.memberId);
    await mute(t.db, { userId: d, orgId: other.orgId });

    expect(await getRelationships(t.db, { orgId: h.orgId, seekerUserIds: [a, b] })).toEqual([
      { seekerUserId: a, blocked: true, muted: false },
      { seekerUserId: b, blocked: false, muted: true },
    ]);
    expect(await getRelationships(t.db, { orgId: h.orgId, seekerUserIds: [d, c] })).toEqual([
      { seekerUserId: d, blocked: false, muted: false },
      { seekerUserId: c, blocked: true, muted: false },
    ]);
    expect(await getRelationships(t.db, { orgId: h.orgId, seekerUserIds: [] })).toEqual([]);
  });

  it('getBlockSet holds both directions and the muted orgs', async () => {
    const me = await seeker();
    const blocker = await seeker();
    const blockedPerson = await seeker();
    const blockedOrg = await host();
    const blockingOrg = await host();
    const muted = await host();
    await block(t.db, user(blocker), user(me), blocker);
    await block(t.db, user(me), user(blockedPerson), me);
    await block(t.db, user(me), org(blockedOrg.orgId), me);
    await block(t.db, org(blockingOrg.orgId), user(me), blockingOrg.memberId);
    await mute(t.db, { userId: me, orgId: muted.orgId });

    const set = await getBlockSet(t.db, me);
    expect([...set.userIds].sort()).toEqual([blocker, blockedPerson].sort());
    expect([...set.orgIds].sort()).toEqual([blockedOrg.orgId, blockingOrg.orgId].sort());
    expect(set.mutedOrgIds).toEqual([muted.orgId]);
  });

  it('blockedUserIdsForOrg holds seekers in both directions', async () => {
    const h = await host();
    const blockedByOrg = await seeker();
    const blockedTheOrg = await seeker();
    const unrelated = await seeker();
    await block(t.db, org(h.orgId), user(blockedByOrg), h.memberId);
    await block(t.db, user(blockedTheOrg), org(h.orgId), blockedTheOrg);
    await block(t.db, user(unrelated), user(blockedByOrg), unrelated);
    expect((await blockedUserIdsForOrg(t.db, h.orgId)).sort()).toEqual(
      [blockedByOrg, blockedTheOrg].sort(),
    );
  });

  it('listBlocks lists only the blocks the party made, newest first', async () => {
    const s = await seeker();
    const first = await host();
    const second = await host();
    const blockedMe = await host();
    const a = await block(t.db, user(s), org(first.orgId), s);
    const b = await block(t.db, user(s), org(second.orgId), s);
    await block(t.db, org(blockedMe.orgId), user(s), blockedMe.memberId);
    const rows = await listBlocks(t.db, user(s));
    expect(rows.map((r) => r.blockId)).toEqual([b.blockId, a.blockId]);
    expect(rows[1]).toEqual({
      blockId: a.blockId,
      by: user(s),
      target: org(first.orgId),
      createdAt: expect.any(Date),
    });
  });

  it('answers nobody for ids that are not uuids', async () => {
    expect(await isBlockedBetween(t.db, user('nope'), org('nope-2'))).toEqual({
      blocked: false,
      byA: false,
      byB: false,
    });
    expect(await getRelationships(t.db, { orgId: 'o1', seekerUserIds: ['u1'] })).toEqual([
      { seekerUserId: 'u1', blocked: false, muted: false },
    ]);
    expect(await getBlockSet(t.db, 'u1')).toEqual({ userIds: [], orgIds: [], mutedOrgIds: [] });
    expect(await listBlocks(t.db, user('u1'))).toEqual([]);
    expect(await blockedUserIdsForOrg(t.db, 'o1')).toEqual([]);
    expect(await listMutes(t.db, 'u1')).toEqual([]);
  });
});

describe('mute', () => {
  it('is idempotent, audits once, and unmute removes it', async () => {
    const s = await seeker();
    const h = await host();
    await mute(t.db, { userId: s, orgId: h.orgId });
    await mute(t.db, { userId: s, orgId: h.orgId });
    expect(await listMutes(t.db, s)).toEqual([{ orgId: h.orgId, mutedAt: expect.any(Date) }]);
    expect(await audits('safety.mute_created', h.orgId)).toEqual([
      { actor_id: s, org_id: null, data: null },
    ]);

    await unmute(t.db, { userId: s, orgId: h.orgId });
    await unmute(t.db, { userId: s, orgId: h.orgId });
    expect(await listMutes(t.db, s)).toEqual([]);
    expect(await audits('safety.mute_removed', h.orgId)).toHaveLength(1);
  });

  it('refuses an org that does not exist', async () => {
    const s = await seeker();
    await expect(mute(t.db, { userId: s, orgId: newId() })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
