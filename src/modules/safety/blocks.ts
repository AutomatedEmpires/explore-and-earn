// Blocks, relationships and block sets (SP4 spec 8.7). W0 stub: W5 implements it (Task 25).
// Read stubs return neutral values: nobody is blocked.
import type { DbOrTx } from '@/lib/db';
import type { BlockRow, BlockSet, Party, Relationship } from '@/lib/safety';

/** Idempotent; org-to-org and self blocks are rejected. */
export async function block(
  _db: DbOrTx,
  _by: Party,
  _target: Party,
  _actorUserId: string,
): Promise<{ blockId: string; created: boolean }> {
  throw new Error('not implemented: block');
}

/** Idempotent. */
export async function unblock(
  _db: DbOrTx,
  _by: Party,
  _target: Party,
  _actorUserId: string,
): Promise<void> {
  throw new Error('not implemented: unblock');
}

export async function unblockById(
  _db: DbOrTx,
  _i: { blockId: string; by: Party; actorUserId: string },
): Promise<void> {
  throw new Error('not implemented: unblockById');
}

export async function isBlockedBetween(
  _db: DbOrTx,
  _a: Party,
  _b: Party,
): Promise<{ blocked: boolean; byA: boolean; byB: boolean }> {
  return { blocked: false, byA: false, byB: false };
}

/** A block in either direction, and whether the seeker muted the org. */
export async function getRelationships(
  _db: DbOrTx,
  i: { orgId: string; seekerUserIds: string[] },
): Promise<Relationship[]> {
  return i.seekerUserIds.map((seekerUserId) => ({ seekerUserId, blocked: false, muted: false }));
}

/** Both directions. */
export async function getBlockSet(_db: DbOrTx, _userId: string): Promise<BlockSet> {
  return { userIds: [], orgIds: [], mutedOrgIds: [] };
}

export async function listBlocks(_db: DbOrTx, _by: Party): Promise<BlockRow[]> {
  return [];
}

/** Either direction. */
export async function blockedUserIdsForOrg(_db: DbOrTx, _orgId: string): Promise<string[]> {
  return [];
}
