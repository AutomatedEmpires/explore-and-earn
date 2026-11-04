'use client';

import { SignOutButton } from '@clerk/nextjs';
import { Button } from '@/ui/components';

/**
 * Signs the operator out and back to the console's sign-in: in the sidebar's account block, and
 * in the bare frame around the passkey page (an operator who cannot add a passkey here).
 */
export function ConsoleSignOut({ className }: { className?: string }) {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <Button variant="ghost" className={className}>
        Sign out
      </Button>
    </SignOutButton>
  );
}
