// Listing scope for a host. Task 8 replaces these bodies.
import type { HostContext } from '@/server/guards';

export async function requireListing(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: requireListing (W0)');
}

export async function requireEntry(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: requireEntry (W0)');
}

export type { HostContext };
