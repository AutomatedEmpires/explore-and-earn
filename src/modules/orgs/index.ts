// Public API of the orgs module: host organizations and memberships. Owned by W2 (Tasks 6-7).
// Depends on identity for types only; identity's Clerk sync calls into this module.
//
// SP2 (W3, Tasks 17-19) adds the team, invitations, recruiter scopes, org status and settings,
// slugs and the activity log, and imports entitlements. Reverse flows to other SP2 modules go
// through domain events (org.status_changed, org.member_removed, hostpage.updated).
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

export { createOrganization, organizationNameSchema } from './create';

export {
  applyClerkMembership,
  applyClerkOrganization,
  deleteClerkOrganization,
  findHostMembership,
  mapClerkRole,
  recordCreatedOrganization,
  slugify,
  type MembershipSnapshot,
  type OrgSnapshot,
} from './sync';

export {
  HOST_CAPABILITIES,
  can,
  requireCapability,
  type HostCapability,
  type Member,
  type RecruiterScope,
} from './roles';

export type { Actor } from '@/modules/entitlements';

export { getMember, listMembers } from './members';

export {
  assignListing,
  canAccessListing,
  getListingAccess,
  type ListingAccess,
} from './scope';

export {
  getOrgStatus,
  setOrgStatus,
  setVerificationStatus,
  type OrgStatus,
  type OrgVerificationStatus,
} from './status';

export {
  getOrgSummaries,
  updateOrg,
  updateOrgSchema,
  websiteUrlSchema,
  type OrgSummary,
  type UpdateOrgInput,
} from './org-settings';

export {
  memberJson,
  memberJsonSchema,
  orgJson,
  orgJsonSchema,
  recruiterScopeSchema,
  type MemberJson,
  type OrgJson,
} from './json';

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W3)`);
}

/** The org a slug belongs to; `retired` when it is no longer the org's current slug. */
export async function resolveSlug(
  _db: DbOrTx,
  _slug: string,
): Promise<{ orgId: string; currentSlug: string; retired: boolean } | null> {
  return notImplemented('resolveSlug');
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

/** W3 replaces the no-op: it creates the invitation token and sends it (Plan decision 9). */
export const jobHandlers: HandlerMap = {
  'orgs.send_invitation': async () => {},
};
