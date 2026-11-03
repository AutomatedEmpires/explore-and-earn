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
  clerkAdmin,
  makeFakeClerkAdmin,
  userHasPasskey,
  userHasStrongAuth,
  type ClerkAdmin,
  type FakeClerkAdmin,
  type OperatorInviteRole,
} from './clerk-admin';

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
} from './sync';

export const jobHandlers: HandlerMap = {};
