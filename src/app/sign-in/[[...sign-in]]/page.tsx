import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { AuthFrame } from '@/ui/patterns/AuthFrame';

export const metadata: Metadata = { title: 'Sign in · Explore&Earn' };

// Clerk's form, themed with the design tokens (src/ui/clerk.ts). After signing in, `/` sends
// each account to its own shell (or to onboarding); a `redirect_url` from a guard wins.
export default function SignInPage() {
  return (
    <AuthFrame>
      <SignIn path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </AuthFrame>
  );
}
