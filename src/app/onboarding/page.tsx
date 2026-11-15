import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { findHostMembership } from '@/modules/orgs';
import { requireUser, type CurrentUser } from '@/server/guards';
import { adminOrigin, homeFor, signInUrl } from '@/server/shell';
import { AuthFrame } from '@/ui/patterns/AuthFrame';
import { OnboardingForm } from './OnboardingForm';
import { onboardingDestination, onboardingHref, onboardingReturnTo } from './return-to';

export const metadata: Metadata = { title: 'Welcome · Explore&Earn' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Where this user's onboarding stands: still to do (for a host whose organization was not
 * created, only that step), or done, going on to `returnTo` or their shell.
 */
async function onboardingFor(
  user: CurrentUser,
  returnTo: string,
): Promise<{ hostOnly: boolean } | { to: string }> {
  if (user.accountType === null) return { hostOnly: false };
  // A host whose organization wasn't created (the request failed halfway) finishes here.
  if (user.accountType === 'host' && !(await findHostMembership(getDb(), user.id, null))) {
    return { hostOnly: true };
  }
  if (user.accountType === 'operator') {
    return { to: homeFor(user.accountType, adminOrigin(getEnv())) };
  }
  return { to: onboardingDestination(user.accountType, returnTo) };
}

/**
 * `/onboarding?returnTo=<path>&step=seeker|host`. `returnTo` is the action a guest started
 * (spec 5.1), sent by sign-up and the page guards; the form reads `step` from the URL.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(
    typeof params.returnTo === 'string' ? params.returnTo : undefined,
  );

  const { userId } = await auth();
  if (!userId) redirect(signInUrl(onboardingHref(returnTo)));

  // Signed in with Clerk; an account we cannot find (deleted) is an error, not a sign-in loop.
  const user = await requireUser();

  const state = await onboardingFor(user, returnTo);
  if ('to' in state) redirect(state.to);

  return (
    <AuthFrame footer="Explore&Earn is free for seekers, forever.">
      <OnboardingForm hostOnly={state.hostOnly} returnTo={returnTo} />
    </AuthFrame>
  );
}
