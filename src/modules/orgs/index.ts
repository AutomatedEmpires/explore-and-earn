// Public API of the orgs module: host organizations and memberships. Owned by W2 (Tasks 6-7).
// Depends on identity for types only; identity's Clerk sync calls into this module.
import type { HandlerMap } from '@/modules/jobs';

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

export const jobHandlers: HandlerMap = {};
