'use client';

import { useReverification } from '@clerk/nextjs';
import { isReverificationCancelledError } from '@clerk/nextjs/errors';
import { useCallback, useState, useTransition } from 'react';
import type { ActionOutcome, ActionResult } from '../actions';

/**
 * Calls a console server action with a pending state and its result. Actions that need Clerk
 * reverification (bans, refunds, settings, invitations) return Clerk's hint; useReverification
 * then shows Clerk's "confirm it's you" dialog and calls the action again.
 */
export function useConsoleAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<ActionOutcome>,
) {
  const verified = useReverification(action);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = useCallback(
    (...args: Args) =>
      new Promise<ActionResult>((resolve) => {
        startTransition(async () => {
          let outcome: ActionResult;
          try {
            outcome = (await verified(...args)) as ActionResult;
          } catch (err) {
            outcome = {
              ok: false,
              error: isReverificationCancelledError(err)
                ? 'Confirm it is you to continue.'
                : 'Something went wrong. Try again.',
            };
          }
          setResult(outcome);
          resolve(outcome);
        });
      }),
    [verified],
  );

  return { run, pending, result, reset: () => setResult(null) };
}
