// Listing scope for the host analytics routes. Lives with the routes because the analytics
// module's public index does not export this helper, and another task owns that index.
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { listingScope } from '@/modules/messaging';
import { requireCapability } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';

/** The member's scope as listing ids. A listing outside that scope is 404. `'all'` is unscoped. */
export async function analyticsListingIds(
  db: DbOrTx,
  ctx: HostContext,
  listingId?: string,
): Promise<string[] | 'all'> {
  requireCapability(ctx, 'applicants.access');
  const scope = await listingScope(db, ctx);
  if (listingId) {
    if (!scope.all && !scope.listingIds.includes(listingId)) throw notFound();
    return [listingId];
  }
  return scope.all ? 'all' : scope.listingIds;
}
