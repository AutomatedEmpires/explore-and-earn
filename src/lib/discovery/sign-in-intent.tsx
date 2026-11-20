// The sign-in prompt and the intent runner (SP3 spec 8.7). W0 stub: W3 replaces it (Task 25).
import type { ReactNode } from 'react';
import type { DiscoverySource } from './types';

/** Renders the SignInPrompt once for its subtree. */
export function SignInIntentProvider(_p: { children: ReactNode }): ReactNode {
  throw new Error('not implemented: SignInIntentProvider');
}

export function useSignInIntent(): {
  requestSignIn(i: {
    action: 'save' | 'skip' | 'alert' | 'apply';
    listingId?: string;
    source?: DiscoverySource;
  }): void;
} {
  throw new Error('not implemented: useSignInIntent');
}

/** Runs a returning guest's intent once, then removes it from the URL. */
export function IntentRunner(): ReactNode {
  throw new Error('not implemented: IntentRunner');
}
