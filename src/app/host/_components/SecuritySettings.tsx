'use client';

import { UserProfile } from '@clerk/nextjs';

/**
 * Clerk's account settings with Security first: passkeys, two-step sign-in and password.
 * Hash routing, so it lives on the one /host/security page.
 */
export function SecuritySettings() {
  return (
    <UserProfile
      routing="hash"
      appearance={{
        elements: {
          rootBox: { width: '100%' },
          cardBox: { width: '100%', maxWidth: '100%' },
        },
      }}
    >
      <UserProfile.Page label="security" />
      <UserProfile.Page label="account" />
    </UserProfile>
  );
}
