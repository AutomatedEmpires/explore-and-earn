// Creating a host organization: in Clerk first (for its ID), then here, with the owner's
// membership. Clerk's webhooks for the same organization may land before or after our insert;
// both paths upsert by Clerk ID, so either order gives one organization and one owner.
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Db, queryRows, withTx } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import type { ClerkAdmin } from '@/modules/identity';
import { recordCreatedOrganization } from './sync';

export { slugify } from './sync';

/** An organization's display name: 2-80 characters after trimming. */
export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'Organization name must be at least 2 characters')
  .max(80, 'Organization name must be at most 80 characters');

type OwnerRow = { clerk_user_id: string; account_type: string | null; deleted: boolean };

// app.users belongs to the identity module. This module reads the two columns it needs by SQL
// rather than calling identity at runtime, because identity's Clerk sync already depends on
// this module and the reverse import would be a cycle.
async function loadOwner(db: Db, userId: string): Promise<OwnerRow | undefined> {
  const [row] = await queryRows<OwnerRow>(
    db,
    sql`select clerk_user_id, account_type, deleted_at is not null as deleted
        from app.users where id = ${userId}`,
  );
  return row;
}

/**
 * Creates an organization owned by `ownerUserId`, which must be a host account. The slug is
 * derived from the name and numbered when taken ("kettle-ridge-lodge-2"). Records `orgs.created`.
 */
export async function createOrganization(
  db: Db,
  clerk: ClerkAdmin,
  input: { ownerUserId: string; name: string },
): Promise<{ id: string; slug: string }> {
  const parsed = organizationNameSchema.safeParse(input.name);
  if (!parsed.success) throw badRequest('Invalid organization name', parsed.error.issues);
  const name = parsed.data;

  const owner = await loadOwner(db, input.ownerUserId);
  if (!owner || owner.deleted) throw notFound('User not found');
  if (owner.account_type !== 'host') throw forbidden('Only host accounts can own an organization');

  const { clerkOrgId } = await clerk.createOrganization({ name, createdBy: owner.clerk_user_id });

  return withTx(db, async (tx) => {
    const org = await recordCreatedOrganization(tx, {
      clerkOrgId,
      name,
      ownerUserId: input.ownerUserId,
    });
    await record(tx, {
      actorType: 'user',
      actorId: input.ownerUserId,
      orgId: org.id,
      action: 'orgs.created',
      subjectType: 'organization',
      subjectId: org.id,
      data: { name, slug: org.slug, clerkOrgId },
    });
    return org;
  });
}
