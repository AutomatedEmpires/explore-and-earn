import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { onboardingHref, returnToFromRedirectUrl } from '@/app/onboarding/return-to';
import { getEnv } from '@/lib/env';
import { AuthFrame } from '@/ui/patterns/AuthFrame';

export const metadata: Metadata = { title: 'Sign in · Explore&Earn' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Clerk's form, themed with the design tokens (src/ui/clerk.ts). After signing in, `/` sends
// each account to its own shell (or to onboarding); a `redirect_url` from a guard wins.
// Clerk turns a sign-in into a sign-up when the email or Google account is new; that new
// account goes to onboarding, carrying the `redirect_url` as `returnTo` (spec 5.1).
export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { redirect_url: redirectUrl } = await searchParams;
  const returnTo = returnToFromRedirectUrl(
    typeof redirectUrl === 'string' ? redirectUrl : undefined,
    getEnv().APP_URL,
  );
  return (
    <AuthFrame>
      <SignIn
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        signUpForceRedirectUrl={onboardingHref(returnTo)}
      />
    </AuthFrame>
  );
}
