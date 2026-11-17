// Who may see a listing, and who is looking at a thread. Task 8 replaces the bodies.
import type { HostContext } from '@/server/guards';

export type ListingScope = { all: true } | { all: false; listingIds: string[] };
export type ThreadViewer = { kind: 'seeker'; userId: string } | { kind: 'host'; ctx: HostContext };

export async function listingScope(..._args: unknown[]): Promise<ListingScope> {
  throw new Error('not implemented: listingScope (W0)');
}

export function inScope(..._args: unknown[]): boolean {
  throw new Error('not implemented: inScope (W0)');
}

export async function listingTeam(..._args: unknown[]): Promise<string[]> {
  throw new Error('not implemented: listingTeam (W0)');
}

export function requireHiringCapability(..._args: unknown[]): void {
  throw new Error('not implemented: requireHiringCapability (W0)');
}
