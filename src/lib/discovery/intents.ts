// Sign-in intents: the action a guest started, carried through sign-in (SP3 spec 8.7).
// W0 stub: W3 replaces the bodies (Task 25).
import type { DiscoverySource } from './types';

export function buildSignInUrls(_i: {
  action: 'save' | 'skip' | 'alert' | 'apply';
  listingId?: string;
  source?: DiscoverySource;
  path: string;
  search: string;
}): { returnUrl: string; signIn: string; signUp: string } {
  throw new Error('not implemented: buildSignInUrls');
}

export function parseIntent(
  _p: URLSearchParams,
): { action: 'save' | 'skip'; listingId: string } | { action: 'alert' } | null {
  throw new Error('not implemented: parseIntent');
}

/** `href` without its `intent` param. */
export function stripIntent(_href: string): string {
  throw new Error('not implemented: stripIntent');
}
