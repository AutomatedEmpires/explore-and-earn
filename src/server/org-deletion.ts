// Deleting a host organization (SP2 spec section 8.1): the Owner types the org's name, the
// subscription is canceled at once without proration, every listing closes, and the org is
// soft-deleted here and deleted in Clerk. It runs here because orgs can't import billing or
// listings. If cancelling fails, nothing is deleted.
import type { Db } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import { cancelSubscriptionNow } from '@/modules/billing';
import type { ClerkAdmin } from '@/modules/identity';
import { closeAllForOrg } from '@/modules/listings';
import { deleteOrganization, getOrgSummaries, requireCapability } from '@/modules/orgs';
import type { HostContext } from './guards';

const normalized = (name: string) => name.trim().toLowerCase();

/**
 * Deletes the caller's organization. `confirmName` must equal its name, ignoring surrounding
 * spaces and letter case (400 `confirm_name_mismatch` otherwise). The route also requires
 * reverification.
 */
export async function deleteHostOrganization(
  db: Db,
  clerk: ClerkAdmin,
  ctx: HostContext,
  confirmName: string,
): Promise<{ redirectTo: '/onboarding' }> {
  requireCapability(ctx, 'org.delete');
  const org = (await getOrgSummaries(db, [ctx.orgId])).get(ctx.orgId);
  if (!org || org.deleted) throw notFound('Organization not found');
  if (normalized(confirmName) !== normalized(org.name)) {
    throw badRequest('Type the organization name exactly as it appears to confirm', {
      reason: 'confirm_name_mismatch',
    });
  }

  await cancelSubscriptionNow(db, ctx.orgId);
  await closeAllForOrg(db, ctx.orgId, 'host');
  await deleteOrganization(db, clerk, ctx);
  return { redirectTo: '/onboarding' };
}
