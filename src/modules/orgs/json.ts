// How team API routes send members and organizations: dates as ISO strings. The zod schemas
// document the responses in /api/v1/openapi.json.
import { z } from 'zod';
import type { OrgSummary } from './org-settings';
import { ORG_ROLES, ORG_STATUSES, VERIFICATION_STATUSES } from './schema';
import type { Member } from './roles';

export const recruiterScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({
    kind: z.literal('assigned'),
    listingIds: z.array(z.uuid()).max(500),
    locationIds: z.array(z.uuid()).max(500),
  }),
]);

export const memberJsonSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  role: z.enum(ORG_ROLES),
  scope: recruiterScopeSchema.nullable(),
  joinedAt: z.iso.datetime(),
});

export type MemberJson = z.infer<typeof memberJsonSchema>;

export function memberJson(m: Member): MemberJson {
  return { ...m, joinedAt: m.joinedAt.toISOString() };
}

export const orgJsonSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(ORG_STATUSES),
  websiteUrl: z.string().nullable(),
  requireRecruiterApproval: z.boolean(),
  primaryLocationId: z.uuid().nullable(),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  ownerUserId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type OrgJson = z.infer<typeof orgJsonSchema>;

/** An organization as its own team sees it (the Clerk id stays server-side). */
export function orgJson(o: OrgSummary): OrgJson {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    status: o.status,
    websiteUrl: o.websiteUrl,
    requireRecruiterApproval: o.requireRecruiterApproval,
    primaryLocationId: o.primaryLocationId,
    verificationStatus: o.verificationStatus,
    ownerUserId: o.ownerUserId,
    createdAt: o.createdAt.toISOString(),
  };
}
