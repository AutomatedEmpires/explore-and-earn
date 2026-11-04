'use client';

import { useUser } from '@clerk/nextjs';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/ui/components';
import { ShieldCheck } from '@/ui/icons';
import { ActionMessage } from './ActionMessage';

/** Registers a passkey for the signed-in operator with Clerk, then opens the console. */
export function PasskeySetup() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addPasskey() {
    if (!user) return;
    setError(null);
    startTransition(async () => {
      try {
        await user.createPasskey();
        router.replace('/');
        router.refresh();
      } catch (err) {
        const message = isClerkAPIResponseError(err) ? err.errors[0]?.longMessage : undefined;
        setError(
          message ??
            (err instanceof Error && err.name === 'NotAllowedError'
              ? 'The passkey was not created. Try again, and confirm on your device when asked.'
              : 'The passkey could not be created. Try again.'),
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        icon={ShieldCheck}
        size="lg"
        loading={pending}
        disabled={!isLoaded || !user}
        onClick={addPasskey}
      >
        Add a passkey
      </Button>
      <ActionMessage result={error ? { ok: false, error } : null} />
    </div>
  );
}
