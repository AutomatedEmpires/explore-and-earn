// A block either way between the seeker and the org stops interview invites and offers
// (SP5 spec section 10: blocks are checked on every invite and thread send).
import type { DbOrTx, Tx } from '@/lib/db';
import { conflict } from '@/lib/errors';
import { READ_ONLY, setThreadReadOnly, threadIdsForApplications } from '@/modules/messaging';
import { getRelationships } from '@/modules/safety';

type Pair = { orgId: string; seekerUserId: string };

export async function isBlocked(db: DbOrTx, i: Pair): Promise<boolean> {
  const [relationship] = await getRelationships(db, { orgId: i.orgId, seekerUserIds: [i.seekerUserId] });
  return relationship?.blocked === true;
}

/**
 * True when the pair is blocked, after stamping the application's thread read-only. The caller
 * must let its transaction commit and then throw `blockedConflict()`, or the stamp is rolled back.
 */
export async function stampIfBlocked(tx: Tx, i: Pair & { applicationId: string }): Promise<boolean> {
  if (!(await isBlocked(tx, i))) return false;
  const threads = await threadIdsForApplications(tx, [i.applicationId]);
  const threadId = threads.get(i.applicationId);
  if (threadId) await setThreadReadOnly(tx, threadId, 'blocked');
  return true;
}

/** The same answer a blocked thread gives a message, so the host learns nothing more. */
export function blockedConflict() {
  return conflict(READ_ONLY, { reason: 'read_only' });
}
