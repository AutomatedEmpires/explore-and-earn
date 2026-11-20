// Client calls to the dispositions API (SP3 spec section 5). W0 stub: W3 replaces it (Task 25).
import type { DiscoverySource, DispositionState } from './types';

export type DispositionResult =
  | { ok: true; state: DispositionState | null; previous: DispositionState | null }
  | { ok: false; reason: 'conflict'; current: DispositionState | null }
  | { ok: false; reason: 'closed' | 'unauthorized' | 'network' }
  | { ok: false; reason: 'saved_limit'; message: string };

export async function putDisposition(
  _listingId: string,
  _b: { state: DispositionState; source: DiscoverySource; expectedState?: DispositionState | null },
): Promise<DispositionResult> {
  throw new Error('not implemented: putDisposition');
}

export async function deleteDisposition(
  _listingId: string,
  _b: { expectedState?: DispositionState },
): Promise<DispositionResult> {
  throw new Error('not implemented: deleteDisposition');
}
