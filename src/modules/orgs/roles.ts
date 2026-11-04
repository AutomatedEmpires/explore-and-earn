// The host role matrix (SP2 spec section 10). Pure, so every route can check a capability
// after `apiRoute({ auth: 'host' })` has resolved the caller's role from the Clerk session.
import { forbidden } from '@/lib/errors';
import type { OrgRole } from '@/modules/identity';

export const HOST_CAPABILITIES = [
  'listings.manage',
  'listings.approve',
  'hostpage.edit',
  'locations.manage',
  'team.manage',
  'org.transfer',
  'org.delete',
  'billing.plan',
  'billing.portal',
  'activity.read',
  'applicants.access',
  'messages.access',
  'invites.send',
] as const;

export type HostCapability = (typeof HOST_CAPABILITIES)[number];

/** What a Recruiter sees: everything, or only the listings and locations assigned to them. */
export type RecruiterScope =
  { kind: 'all' } | { kind: 'assigned'; listingIds: string[]; locationIds: string[] };

export type Member = {
  membershipId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: OrgRole;
  /** Set for Recruiters only. */
  scope: RecruiterScope | null;
  joinedAt: Date;
};

const TEAM: readonly OrgRole[] = ['owner', 'admin', 'recruiter'];
const MANAGERS: readonly OrgRole[] = ['owner', 'admin'];
const OWNER: readonly OrgRole[] = ['owner'];

const ALLOWED: Record<HostCapability, readonly OrgRole[]> = {
  'listings.manage': TEAM,
  'applicants.access': TEAM,
  'messages.access': TEAM,
  'invites.send': TEAM,
  'listings.approve': MANAGERS,
  'hostpage.edit': MANAGERS,
  'locations.manage': MANAGERS,
  'team.manage': MANAGERS,
  'activity.read': MANAGERS,
  'billing.plan': MANAGERS,
  'org.transfer': OWNER,
  'org.delete': OWNER,
  'billing.portal': ['owner', 'admin', 'billing'],
};

/** Whether the caller's role holds `cap`. Takes a HostContext (only its role is read). */
export function can(ctx: { role: OrgRole }, cap: HostCapability): boolean {
  return ALLOWED[cap].includes(ctx.role);
}

/** Throws 403 `forbidden` with `details.reason = 'role_not_allowed'` unless `can(ctx, cap)`. */
export function requireCapability(ctx: { role: OrgRole }, cap: HostCapability): void {
  if (!can(ctx, cap)) {
    throw forbidden('Your role in this organization does not allow this', {
      reason: 'role_not_allowed',
    });
  }
}
