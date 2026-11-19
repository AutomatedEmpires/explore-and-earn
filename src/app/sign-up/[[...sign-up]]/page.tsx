import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { onboardingHref, returnToFromRedirectUrl } from '@/app/onboarding/return-to';
import { getEnv } from '@/lib/env';
import { AuthFrame } from '@/ui/patterns/AuthFrame';

export const metadata: Metadata = { title: 'Create your account · Explore&Earn' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Clerk's form, themed with the design tokens (src/ui/clerk.ts). Every new account chooses
// Seeker or Host next, so sign-up always continues to onboarding. A `redirect_url` (the action
// a guest started, spec 5.1) goes along as onboarding's `returnTo`, if it is on this site.
export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const { redirect_url: redirectUrl } = await searchParams;
  const returnTo = returnToFromRedirectUrl(
    typeof redirectUrl === 'string' ? redirectUrl : undefined,
    getEnv().APP_URL,
  );
  return (
    <AuthFrame footer="Free for seekers, forever.">
      <SignUp path="/sign-up" signInUrl="/sign-in" forceRedirectUrl={onboardingHref(returnTo)} />
    </AuthFrame>
  );
}
