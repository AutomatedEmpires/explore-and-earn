// Blocks, relationships and block sets (SP4 spec 8.7; plan Task 25).
//
// A block is one direction between two parties: a user blocks an org or another user, or an org
// blocks a user. Org-to-org and self blocks are refused. Every read the server uses to keep
// two parties apart (isBlockedBetween, getRelationships, getBlockSet, blockedUserIdsForOrg)
// looks both ways. A party is only ever shown the blocks it made itself (listBlocks): a seeker
// never learns that a host blocked them, and a host never learns that a seeker blocked it.
//
// Audit rows carry the two party types only. A seeker's block is never filed under the org it
// blocked (`org_id` stays null), so nothing scoped to that org can reveal it.
import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { BlockRow, BlockSet, Party, Relationship } from '@/lib/safety';
import { record } from '@/modules/audit';
import { unfollow } from '@/modules/hostpages';
import { findUserById } from '@/modules/identity';
import { getOrgSummaries } from '@/modules/orgs';
import { isUuid, uuids } from './ids';
import { blocks, mutes, type BlockRecord } from './schema';

const NOT_BLOCKED = { blocked: false, byA: false, byB: false } as const;

/** Rows where `blocker` blocked `blocked`. */
function pair(blocker: Party, blocked: Party): SQL | undefined {
  return and(
    eq(blocks.blockerType, blocker.type),
    eq(blocks.blockerId, blocker.id),
    eq(blocks.blockedType, blocked.type),
    eq(blocks.blockedId, blocked.id),
  );
}

function blockerOf(r: Pick<BlockRecord, 'blockerType' | 'blockerId'>): Party {
  return { type: r.blockerType, id: r.blockerId };
}

function blockedOf(r: Pick<BlockRecord, 'blockedType' | 'blockedId'>): Party {
  return { type: r.blockedType, id: r.blockedId };
}

function isParty(p: Party, type: Party['type'], id: string): boolean {
  return p.type === type && p.id === id;
}

async function assertExists(db: DbOrTx, target: Party): Promise<void> {
  const missing = () => notFound("We couldn't find who you want to block");
  if (!isUuid(target.id)) throw missing();
  if (target.type === 'user') {
    const found = await findUserById(db, target.id);
    if (!found || found.deletedAt) throw missing();
    return;
  }
  const org = (await getOrgSummaries(db, [target.id])).get(target.id);
  if (!org || org.deleted) throw missing();
}

async function audit(
  db: DbOrTx,
  action: 'safety.block_created' | 'safety.block_removed',
  row: { id: string; by: Party; target: Party },
  actorUserId: string,
): Promise<void> {
  await record(db, {
    actorType: 'user',
    actorId: actorUserId,
    orgId: row.by.type === 'org' ? row.by.id : null,
    action,
    subjectType: 'block',
    subjectId: row.id,
    data: { blockerType: row.by.type, blockedType: row.target.type },
  });
}

/**
 * Blocks `target` for `by`. Idempotent: a repeat returns the first block with
 * `created: false`. Org to org and a party blocking itself are `bad_request`; an unknown target
 * is `not_found`. A user blocking an org also unfollows it.
 */
export async function block(
  db: DbOrTx,
  by: Party,
  target: Party,
  actorUserId: string,
): Promise<{ blockId: string; created: boolean }> {
  if (by.type === 'org' && target.type === 'org') {
    throw badRequest("An organization can't block another organization", {
      reason: 'org_to_org',
    });
  }
  if (by.type === target.type && by.id === target.id) {
    throw badRequest("You can't block yourself", { reason: 'self_block' });
  }
  return db.transaction(async (tx) => {
    await assertExists(tx, target);
    const [inserted] = await tx
      .insert(blocks)
      .values({
        id: newId(),
        blockerType: by.type,
        blockerId: by.id,
        blockedType: target.type,
        blockedId: target.id,
        createdBy: actorUserId,
      })
      .onConflictDoNothing({
        target: [blocks.blockerType, blocks.blockerId, blocks.blockedType, blocks.blockedId],
      })
      .returning({ id: blocks.id });

    let blockId = inserted?.id;
    if (!blockId) {
      const [existing] = await tx.select({ id: blocks.id }).from(blocks).where(pair(by, target));
      if (!existing) throw new Error('block: the existing block disappeared');
      blockId = existing.id;
    }
    // Every time, so a follow that slipped in since the first block is gone as well.
    if (by.type === 'user' && target.type === 'org') await unfollow(tx, by.id, target.id);
    if (inserted) await audit(tx, 'safety.block_created', { id: blockId, by, target }, actorUserId);
    return { blockId, created: inserted !== undefined };
  });
}

/** Removes `by`'s block of `target`. Idempotent. */
export async function unblock(
  db: DbOrTx,
  by: Party,
  target: Party,
  actorUserId: string,
): Promise<void> {
  if (!isUuid(by.id) || !isUuid(target.id)) return;
  await db.transaction(async (tx) => {
    const removed = await tx.delete(blocks).where(pair(by, target)).returning({ id: blocks.id });
    for (const row of removed) {
      await audit(tx, 'safety.block_removed', { id: row.id, by, target }, actorUserId);
    }
  });
}

/** Removes one block by id. `not_found` unless `by` made it. */
export async function unblockById(
  db: DbOrTx,
  i: { blockId: string; by: Party; actorUserId: string },
): Promise<void> {
  const missing = () => notFound('Block not found');
  if (!isUuid(i.blockId) || !isUuid(i.by.id)) throw missing();
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(blocks)
      .where(
        and(
          eq(blocks.id, i.blockId),
          eq(blocks.blockerType, i.by.type),
          eq(blocks.blockerId, i.by.id),
        ),
      )
      .returning();
    if (!removed) throw missing();
    await audit(
      tx,
      'safety.block_removed',
      { id: removed.id, by: blockerOf(removed), target: blockedOf(removed) },
      i.actorUserId,
    );
  });
}

/** `byA`: `a` blocked `b`; `byB`: `b` blocked `a`. */
export async function isBlockedBetween(
  db: DbOrTx,
  a: Party,
  b: Party,
): Promise<{ blocked: boolean; byA: boolean; byB: boolean }> {
  if (!isUuid(a.id) || !isUuid(b.id)) return { ...NOT_BLOCKED };
  const rows = await db
    .select({ blockerType: blocks.blockerType, blockerId: blocks.blockerId })
    .from(blocks)
    .where(or(pair(a, b), pair(b, a)));
  const byA = rows.some((r) => isParty(blockerOf(r), a.type, a.id));
  const byB = rows.some((r) => isParty(blockerOf(r), b.type, b.id));
  return { blocked: byA || byB, byA, byB };
}

/**
 * One row per seeker, in input order: `blocked` when the org blocked the seeker or the seeker
 * blocked the org, `muted` when the seeker muted the org.
 */
export async function getRelationships(
  db: DbOrTx,
  i: { orgId: string; seekerUserIds: string[] },
): Promise<Relationship[]> {
  const ids = uuids(i.seekerUserIds);
  const blocked = new Set<string>();
  const muted = new Set<string>();
  if (ids.length > 0 && isUuid(i.orgId)) {
    const [blockRows, muteRows] = await Promise.all([
      db
        .select({ blockerType: blocks.blockerType, blockerId: blocks.blockerId, blockedId: blocks.blockedId })
        .from(blocks)
        .where(
          or(
            and(
              eq(blocks.blockerType, 'org'),
              eq(blocks.blockerId, i.orgId),
              eq(blocks.blockedType, 'user'),
              inArray(blocks.blockedId, ids),
            ),
            and(
              eq(blocks.blockedType, 'org'),
              eq(blocks.blockedId, i.orgId),
              eq(blocks.blockerType, 'user'),
              inArray(blocks.blockerId, ids),
            ),
          ),
        ),
      db
        .select({ seekerUserId: mutes.seekerUserId })
        .from(mutes)
        .where(and(eq(mutes.orgId, i.orgId), inArray(mutes.seekerUserId, ids))),
    ]);
    for (const r of blockRows) blocked.add(r.blockerType === 'org' ? r.blockedId : r.blockerId);
    for (const r of muteRows) muted.add(r.seekerUserId);
  }
  return i.seekerUserIds.map((seekerUserId) => ({
    seekerUserId,
    blocked: blocked.has(seekerUserId),
    muted: muted.has(seekerUserId),
  }));
}

/**
 * Everyone to keep apart from `userId`, both directions (users and orgs they blocked, and
 * users and orgs that blocked them), plus the orgs they muted. Server use only.
 */
export async function getBlockSet(db: DbOrTx, userId: string): Promise<BlockSet> {
  if (!isUuid(userId)) return { userIds: [], orgIds: [], mutedOrgIds: [] };
  const me: Party = { type: 'user', id: userId };
  const [rows, muteRows] = await Promise.all([
    db
      .select({
        blockerType: blocks.blockerType,
        blockerId: blocks.blockerId,
        blockedType: blocks.blockedType,
        blockedId: blocks.blockedId,
      })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerType, 'user'), eq(blocks.blockerId, userId)),
          and(eq(blocks.blockedType, 'user'), eq(blocks.blockedId, userId)),
        ),
      ),
    db
      .select({ orgId: mutes.orgId })
      .from(mutes)
      .where(eq(mutes.seekerUserId, userId))
      .orderBy(desc(mutes.createdAt)),
  ]);
  const userIds = new Set<string>();
  const orgIds = new Set<string>();
  for (const r of rows) {
    const other = isParty(blockerOf(r), me.type, me.id) ? blockedOf(r) : blockerOf(r);
    (other.type === 'user' ? userIds : orgIds).add(other.id);
  }
  return {
    userIds: [...userIds],
    orgIds: [...orgIds],
    mutedOrgIds: muteRows.map((r) => r.orgId),
  };
}

/** The blocks `by` made, newest first. */
export async function listBlocks(db: DbOrTx, by: Party): Promise<BlockRow[]> {
  if (!isUuid(by.id)) return [];
  const rows = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.blockerType, by.type), eq(blocks.blockerId, by.id)))
    .orderBy(desc(blocks.createdAt), desc(blocks.id));
  return rows.map((r) => ({
    blockId: r.id,
    by: blockerOf(r),
    target: blockedOf(r),
    createdAt: r.createdAt,
  }));
}

/** Users the org blocked and users who blocked the org. */
export async function blockedUserIdsForOrg(db: DbOrTx, orgId: string): Promise<string[]> {
  if (!isUuid(orgId)) return [];
  const rows = await db
    .select({ blockerType: blocks.blockerType, blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerType, 'org'), eq(blocks.blockerId, orgId), eq(blocks.blockedType, 'user')),
        and(eq(blocks.blockedType, 'org'), eq(blocks.blockedId, orgId), eq(blocks.blockerType, 'user')),
      ),
    );
  return [...new Set(rows.map((r) => (r.blockerType === 'org' ? r.blockedId : r.blockerId)))];
}
