// Page guards (SP3 spec 8.7): seeker-only pages send everyone else where they can continue,
// carrying a safe return path through sign-in and onboarding.
import { redirect } from 'next/navigation';
import { safeReturnTo } from '@/lib/discovery';
import { isAppError } from '@/lib/errors';
import { requireSeeker, type CurrentUser, type GuardDenial } from '@/server/guards';

/** Where a denied visitor goes: sign-in, onboarding or home. Rethrows anything else. */
function deniedTarget(err: unknown, back: string): string {
  if (isAppError(err)) {
    if (err.code === 'unauthorized') return `/sign-in?redirect_url=${back}`;
    const reason = (err.details as GuardDenial | undefined)?.reason;
    if (err.code === 'forbidden' && reason === 'needs_onboarding') {
      return `/onboarding?returnTo=${back}`;
    }
    if (err.code === 'forbidden' && reason === 'wrong_account_type') return '/';
  }
  throw err;
}

/**
 * The signed-in seeker. A guest is redirected to sign in, a user without an account type to
 * onboarding (both coming back to `returnPath`), and a host or operator home.
 */
export async function requireSeekerPage(returnPath: string): Promise<CurrentUser> {
  let target: string;
  try {
    return await requireSeeker();
  } catch (err) {
    target = deniedTarget(err, encodeURIComponent(safeReturnTo(returnPath)));
  }
  redirect(target);
}
