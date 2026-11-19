// The names and logos of hosts a seeker blocked or muted, for their own lists (GET /me/blocks,
// GET /me/mutes). A host whose page is not public (or no longer is) still has a name: the
// seeker must be able to find it to unblock or unmute it.
import type { DbOrTx } from '@/lib/db';
import { getHostIdentities } from '@/modules/hostpages';
import { getOrgSummaries } from '@/modules/orgs';

/** When the org row itself is gone, which soft deletion never does. */
const UNKNOWN_HOST = 'A host';

export async function hostNames(
  db: DbOrTx,
  orgIds: string[],
): Promise<Map<string, { name: string; logoMediaId: string | null }>> {
  const out = new Map<string, { name: string; logoMediaId: string | null }>();
  if (orgIds.length === 0) return out;
  const [identities, summaries] = await Promise.all([
    getHostIdentities(db, orgIds),
    getOrgSummaries(db, orgIds),
  ]);
  for (const id of orgIds) {
    const identity = identities.get(id);
    out.set(id, {
      name: identity?.name ?? summaries.get(id)?.name ?? UNKNOWN_HOST,
      logoMediaId: identity?.logoMediaId ?? null,
    });
  }
  return out;
}
