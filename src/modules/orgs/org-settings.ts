// Organization settings (name, website, the Recruiter approval rule, the primary location) and
// the summaries other modules read. A rename is pushed to Clerk in the same transaction, so a
// Clerk failure leaves nothing changed and Clerk's next snapshot can't undo the rename.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import { record } from '@/modules/audit';
import type { ClerkAdmin } from '@/modules/identity';
import type { HostContext } from '@/server/guards';
import { organizationNameSchema } from './create';
import { requireCapability } from './roles';
import { organizations } from './schema';
import type { OrgStatus, OrgVerificationStatus } from './status';

export type OrgSummary = {
  id: string;
  clerkOrgId: string;
  name: string;
  slug: string;
  status: OrgStatus;
  deleted: boolean;
  websiteUrl: string | null;
  requireRecruiterApproval: boolean;
  primaryLocationId: string | null;
  verificationStatus: OrgVerificationStatus;
  ownerUserId: string | null;
  createdAt: Date;
};

type OrgRow = typeof organizations.$inferSelect;

function toSummary(o: OrgRow): OrgSummary {
  return {
    id: o.id,
    clerkOrgId: o.clerkOrgId,
    name: o.name,
    slug: o.slug,
    status: o.status,
    deleted: o.deletedAt !== null,
    websiteUrl: o.websiteUrl,
    requireRecruiterApproval: o.requireRecruiterApproval,
    primaryLocationId: o.primaryLocationId,
    verificationStatus: o.verificationStatus,
    ownerUserId: o.ownerUserId,
    createdAt: o.createdAt,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Organizations by id, deleted ones included (flagged). Unknown ids are left out. */
export async function getOrgSummaries(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, OrgSummary>> {
  const valid = [...new Set(ids.filter((id) => UUID.test(id)))];
  const out = new Map<string, OrgSummary>();
  if (valid.length === 0) return out;
  const rows = await db.select().from(organizations).where(inArray(organizations.id, valid));
  for (const o of rows) out.set(o.id, toSummary(o));
  return out;
}

/** An https website address as typed (the scheme lowercased), or null to clear it. */
export const websiteUrlSchema = z
  .string()
  .trim()
  .max(2048, 'Your website address is too long')
  .transform((v) => v.replace(/^https:\/\//i, 'https://'))
  .refine(
    (v) => v.startsWith('https://') && URL.canParse(v) && new URL(v).hostname !== '',
    'Your website address must start with https://',
  );

/** PATCH /host/org input. */
export const updateOrgSchema = z.object({
  name: organizationNameSchema.optional(),
  websiteUrl: websiteUrlSchema.nullable().optional(),
  requireRecruiterApproval: z.boolean().optional(),
  primaryLocationId: z.uuid().nullable().optional(),
});

export type UpdateOrgInput = z.input<typeof updateOrgSchema>;

/**
 * Updates the caller's organization (Owner or Admin: `team.manage`). The name passes
 * `organizationNameSchema` and the website must be https (`bad_request` otherwise). A rename
 * is also made in Clerk. Records `orgs.updated` with the changed fields. The caller checks that
 * `primaryLocationId` is one of the org's live locations (orgs can't import locations).
 */
export async function updateOrg(
  db: DbOrTx,
  clerk: ClerkAdmin,
  ctx: HostContext,
  i: UpdateOrgInput,
): Promise<OrgSummary> {
  requireCapability(ctx, 'team.manage');
  const parsed = updateOrgSchema.safeParse(i);
  if (!parsed.success) throw badRequest('Invalid organization settings', parsed.error.issues);
  const input = parsed.data;

  return db.transaction(async (tx) => {
    const [org] = await tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, ctx.orgId), isNull(organizations.deletedAt)))
      .for('update');
    if (!org) throw notFound('Organization not found');

    const patch: Partial<typeof organizations.$inferInsert> = {};
    if (input.name !== undefined && input.name !== org.name) patch.name = input.name;
    if (input.websiteUrl !== undefined && input.websiteUrl !== org.websiteUrl) {
      patch.websiteUrl = input.websiteUrl;
    }
    if (
      input.requireRecruiterApproval !== undefined &&
      input.requireRecruiterApproval !== org.requireRecruiterApproval
    ) {
      patch.requireRecruiterApproval = input.requireRecruiterApproval;
    }
    if (input.primaryLocationId !== undefined && input.primaryLocationId !== org.primaryLocationId) {
      patch.primaryLocationId = input.primaryLocationId;
    }
    if (Object.keys(patch).length === 0) return toSummary(org);

    const [updated] = await tx
      .update(organizations)
      .set(patch)
      .where(eq(organizations.id, org.id))
      .returning();
    if (!updated) throw notFound('Organization not found');

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      changes[key] = { from: org[key as keyof OrgRow], to: updated[key as keyof OrgRow] };
    }
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: org.id,
      action: 'orgs.updated',
      subjectType: 'organization',
      subjectId: org.id,
      data: { changes },
    });
    if (patch.name !== undefined) {
      await clerk.updateOrganization(org.clerkOrgId, { name: updated.name });
    }
    return toSummary(updated);
  });
}
