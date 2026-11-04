import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { findHostMembership } from '@/modules/orgs';
import { requireUser, type CurrentUser } from '@/server/guards';
import { adminOrigin, homeFor, signInUrl } from '@/server/shell';
import { AuthFrame } from '@/ui/patterns/AuthFrame';
import { OnboardingForm, type OnboardingStep } from './OnboardingForm';

export const metadata: Metadata = { title: 'Welcome · Explore&Earn' };

/** Where this user's onboarding stands: a step to show, or done (their shell). */
async function onboardingFor(
  user: CurrentUser,
): Promise<{ step: OnboardingStep } | { to: string }> {
  if (user.accountType === null) return { step: 'choose' };
  // A host whose organization wasn't created (the request failed halfway) finishes here.
  if (user.accountType === 'host' && !(await findHostMembership(getDb(), user.id, null))) {
    return { step: 'host' };
  }
  return { to: homeFor(user.accountType, adminOrigin(getEnv())) };
}

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect(signInUrl('/onboarding'));

  // Signed in with Clerk; an account we cannot find (deleted) is an error, not a sign-in loop.
  const user = await requireUser();

  const state = await onboardingFor(user);
  if ('to' in state) redirect(state.to);

  return (
    <AuthFrame footer="Explore&Earn is free for seekers, forever.">
      <OnboardingForm initialStep={state.step} />
    </AuthFrame>
  );
}
