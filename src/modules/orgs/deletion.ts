// Soft-deleting an organization. The full host flow (confirm by name, cancel the subscription,
// close every listing, then this) is src/server/org-deletion.ts, because orgs can't import
// billing or listings.
import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import type { ClerkAdmin } from '@/modules/identity';
import { emit } from '@/modules/jobs';
import type { HostContext } from '@/server/guards';
import { requireCapability } from './roles';
import { organizations } from './schema';

/**
 * Deletes the caller's organization (the Owner only): sets `deleted_at`, records `orgs.deleted`,
 * emits `hostpage.updated` (the host page now 404s) and deletes the org in Clerk, last, so a
 * Clerk failure leaves the org as it was.
 */
export async function deleteOrganization(
  db: DbOrTx,
  clerk: ClerkAdmin,
  ctx: HostContext,
): Promise<void> {
  requireCapability(ctx, 'org.delete');
  await db.transaction(async (tx) => {
    const [org] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, ctx.orgId), isNull(organizations.deletedAt)))
      .for('update');
    if (!org) throw notFound('Organization not found');

    await tx
      .update(organizations)
      .set({ deletedAt: new Date() })
      .where(eq(organizations.id, org.id));
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: org.id,
      action: 'orgs.deleted',
      subjectType: 'organization',
      subjectId: org.id,
      data: { name: org.name, slug: org.slug },
    });
    await emit(tx, 'hostpage.updated', { orgId: org.id }, newId());
    await clerk.deleteOrganization(org.clerkOrgId);
  });
}
