// Save, skip, apply and undo for one listing, with guests and the 10-second Undo window
// (SP3 spec 3.3 and 8.5). W0 stub: W3 replaces the bodies (Task 25).
import type { DispositionResult } from './disposition-client';
import type { DiscoverySource, DispositionState, JobCardData } from './types';

export function useUndoableDispositions(): {
  act(
    listingId: string,
    next: DispositionState | null,
    source: DiscoverySource,
    current: DispositionState | null,
  ): Promise<DispositionResult>;
  undo(): Promise<boolean>;
  canUndo: boolean;
} {
  throw new Error('not implemented: useUndoableDispositions');
}

export function useListingActions(_i: {
  listingId: string;
  source: DiscoverySource;
  initial: JobCardData['viewer'];
}): {
  save(): Promise<void>;
  skip(): Promise<void>;
  apply(): void;
  undo(): Promise<boolean>;
  state: { disposition: DispositionState | null; applied: boolean; pending: boolean };
} {
  throw new Error('not implemented: useListingActions');
}
