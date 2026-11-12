// Public API of the identity module (users, operators, Clerk sync, onboarding).
// Owned by W2 (Tasks 6-8).
import type { HandlerMap } from '@/modules/jobs';

/** A host organization role in our system (spec section 3). */
export type OrgRole = 'owner' | 'admin' | 'recruiter' | 'billing';

export type CurrentUser = {
  id: string;
  clerkUserId: string;
  accountType: 'seeker' | 'host' | 'operator' | null;
  email: string | null;
};

export {
  bootstrapOwnerInvite,
  countOperators,
  evaluateHostAccess,
  evaluateOperatorAccess,
  findUserByClerkId,
  getOperator,
  type HostAccess,
  type OperatorAccess,
  type OperatorRecord,
  type UserRecord,
} from './access';

export {
  getUserContact,
  listActiveOperators,
  markOperatorAssigned,
  type ActiveOperator,
  type OperatorFilter,
  type UserContact,
} from './directory';

export {
  CREATED_VIA_APP,
  CREATED_VIA_KEY,
  clerkAdmin,
  makeFakeClerkAdmin,
  userHasPasskey,
  userHasStrongAuth,
  type ClerkAdmin,
  type ClerkOrgRole,
  type FakeClerkAdmin,
  type OperatorInviteRole,
} from './clerk-admin';

export { getUserContacts, type UserContactFacts } from './contacts';

export {
  completeOnboarding,
  onboardingRequestSchema,
  setAccountType,
  type AccountTypeInput,
  type OnboardingRequest,
} from './onboarding';

export {
  applyClerkUser,
  handleClerkEvent,
  mapClerkRole,
  syncClerkUser,
  type ClerkEvent,
  type ClerkEventResult,
} from './sync';

export type { AccountType, OperatorRole } from './schema';

export const jobHandlers: HandlerMap = {};
