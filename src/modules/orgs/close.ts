// Closing an organization and removing one membership. W1 fills these in.
import type { DbOrTx } from '@/lib/db';

export async function closeOrganization(
  _db: DbOrTx,
  _i: { orgId: string; actorUserId: string | null; reason: string },
): Promise<{ closed: boolean }> {
  throw new Error('not implemented: closeOrganization (W1)');
}

export async function eraseMembership(
  _db: DbOrTx,
  _i: { orgId: string; userId: string; reason: string },
): Promise<{ removed: boolean }> {
  throw new Error('not implemented: eraseMembership (W1)');
}
