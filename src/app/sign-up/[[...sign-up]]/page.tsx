import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { AuthFrame } from '@/ui/patterns/AuthFrame';

export const metadata: Metadata = { title: 'Create your account · Explore&Earn' };

// Clerk's form, themed with the design tokens (src/ui/clerk.ts). Every new account chooses
// Seeker or Host next, so sign-up always continues to onboarding.
export default function SignUpPage() {
  return (
    <AuthFrame footer="Free for seekers, forever.">
      <SignUp path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/onboarding" />
    </AuthFrame>
  );
}
