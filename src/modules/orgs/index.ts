// Public API of the orgs module: host organizations and memberships. Owned by W2 (Tasks 6-7).
// Identity's Clerk sync calls into this module, so orgs imports identity for types, and loads
// it at runtime only when first needed (accepting an invitation sets the account type).
//
// SP2 (W3, Tasks 17-19) adds the team, invitations, recruiter scopes, org status and settings,
// slugs and the activity log, and imports entitlements. Reverse flows to other SP2 modules go
// through domain events (org.status_changed, org.member_removed, hostpage.updated).
import type { HandlerMap } from '@/modules/jobs';
import { SEND_INVITATION_TOPIC, sendInvitationJob } from './invitations';

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

export { assignListing, canAccessListing, getListingAccess, type ListingAccess } from './scope';

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
  invitationJson,
  invitationJsonSchema,
  memberJson,
  memberJsonSchema,
  orgJson,
  orgJsonSchema,
  recruiterScopeSchema,
  type InvitationJson,
  type MemberJson,
  type OrgJson,
} from './json';

// Loading ./invitations registers the `seat` usage counter and (through ./notifications) the
// team notification types.
export {
  acceptInvitation,
  countSeats,
  createInvitation,
  createInvitationSchema,
  listInvitations,
  maskEmail,
  previewInvitation,
  revokeInvitation,
  sendInvitationJob,
  toClerkRole,
  type CreateInvitationInput,
  type Invitation,
  type InvitationRole,
} from './invitations';

export { ROLE_LABELS, ROLE_PHRASES } from './notifications';

export { INVITATION_ROLES, ORG_ROLES } from './schema';

export { changeMember, changeMemberSchema, removeMember, transferOwnership } from './member-admin';

export { RESERVED_SLUGS, changeSlug, resolveSlug } from './slugs';

export {
  ACTIVITY_ACTION_PREFIXES,
  ACTIVITY_PAGE_SIZE,
  listActivity,
  type ActivityItem,
} from './activity';

export { deleteOrganization } from './deletion';

/** SP8 registers these with its privacy exporter and eraser. */
export { privacyHandlers } from './privacy';

export const jobHandlers: HandlerMap = {
  // Creates the invitation token and emails it in one step (SP2 plan decision 9).
  [SEND_INVITATION_TOPIC]: async (payload, { db, now }) => {
    await sendInvitationJob(db, payload, now);
  },
};
