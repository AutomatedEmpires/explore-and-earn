// Creating a host organization: in Clerk first (for its ID), then here, with the owner's
// membership. Clerk's webhooks for the same organization may land before or after our insert;
// both paths upsert by Clerk ID, so either order gives one organization and one owner.
import { type Db, withTx } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import type { ClerkAdmin, UserContact } from '@/modules/identity';
import { organizationNameSchema } from './name';
import { recordCreatedOrganization } from './sync';

export { slugify } from './sync';
export { organizationNameSchema };

// app.users belongs to the identity module, so the owner is read through its index. Identity
// imports this module while it loads, so a static import back would be an evaluation-order
// cycle; it is loaded when first needed instead. The name schema lives in ./name so that
// cycle cannot observe it before it is assigned.
async function loadOwner(db: Db, userId: string): Promise<UserContact | null> {
  const { getUserContact } = await import('@/modules/identity');
  return getUserContact(db, userId);
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
  if (owner.accountType !== 'host') throw forbidden('Only host accounts can own an organization');

  const { clerkOrgId } = await clerk.createOrganization({ name, createdBy: owner.clerkUserId });

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
