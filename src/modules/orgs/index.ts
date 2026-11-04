// Public API of the orgs module: host organizations and memberships. Owned by W2 (Tasks 6-7).
// Depends on identity for types only; identity's Clerk sync calls into this module.
//
// SP2 adds the team, invitations, recruiter scopes, org status and settings, slugs and the
// activity log, and imports entitlements. The SP2 functions below are W0 typed stubs that W3
// (Tasks 17-19) replaces; the role matrix (./roles) is real.
import type { DbOrTx } from '@/lib/db';
import type { Actor } from '@/modules/entitlements';
import type { HandlerMap } from '@/modules/jobs';
import type { HostContext } from '@/server/guards';
import type { Member } from './roles';

export { createOrganization, organizationNameSchema } from './create';

export {
  applyClerkMembership,
  applyClerkOrganization,
  CREATED_VIA_APP,
  CREATED_VIA_KEY,
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

export type OrgStatus = 'active' | 'suspended' | 'banned';

/** The same values as verification's VerificationStatus (orgs can't import verification). */
export type OrgVerificationStatus =
  'unverified' | 'running' | 'verified' | 'needs_review' | 'needs_info' | 'failed';

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

export type ListingAccess =
  { all: true } | { all: false; listingIds: string[]; locationIds: string[] };

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W3)`);
}

export async function listMembers(_db: DbOrTx, _orgId: string): Promise<Member[]> {
  return notImplemented('listMembers');
}

/** Owner, Admin and Recruiters with scope `all` see everything; Billing sees no listings. */
export async function getListingAccess(_db: DbOrTx, _ctx: HostContext): Promise<ListingAccess> {
  return notImplemented('getListingAccess');
}

/** SP5. */
export async function canAccessListing(
  _db: DbOrTx,
  _ctx: HostContext,
  _l: { id: string; locationId: string | null },
): Promise<boolean> {
  return notImplemented('canAccessListing');
}

export async function getOrgStatus(_db: DbOrTx, _orgId: string): Promise<OrgStatus> {
  return notImplemented('getOrgStatus');
}

export async function getMember(
  _db: DbOrTx,
  _orgId: string,
  _userId: string,
): Promise<Member | null> {
  return notImplemented('getMember');
}

export async function getOrgSummaries(
  _db: DbOrTx,
  _ids: string[],
): Promise<Map<string, OrgSummary>> {
  return notImplemented('getOrgSummaries');
}

/** Sets the status, records `orgs.status_changed` and emits `org.status_changed`. */
export async function setOrgStatus(
  _db: DbOrTx,
  _orgId: string,
  _status: OrgStatus,
  _actor: Actor,
  _reason?: string,
): Promise<void> {
  return notImplemented('setOrgStatus');
}

export async function setVerificationStatus(
  _db: DbOrTx,
  _orgId: string,
  _status: OrgVerificationStatus,
  _at?: Date,
): Promise<void> {
  return notImplemented('setVerificationStatus');
}

/** Assigns a listing to an `assigned` Recruiter (listings they create are auto-assigned). */
export async function assignListing(
  _db: DbOrTx,
  _orgId: string,
  _userId: string,
  _listingId: string,
): Promise<void> {
  return notImplemented('assignListing');
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
