// Public API of the verification module: business verification signals and decisions (SP2 spec
// sections 3 and 8.4). W0 contract: typed stubs that W6 (Tasks 29-30) replaces. Imports billing,
// locations and orgs.
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

export type VerificationStatus =
  'unverified' | 'running' | 'verified' | 'needs_review' | 'needs_info' | 'failed';

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name} (W6)`);
}

export async function getVerificationStatus(
  _db: DbOrTx,
  _orgId: string,
): Promise<VerificationStatus> {
  return notImplemented('getVerificationStatus');
}

/** Starts verification (status `running`) and enqueues `verification.run`. */
export async function startVerification(
  _db: DbOrTx,
  _orgId: string,
  _triggerListingId: string,
): Promise<void> {
  return notImplemented('startVerification');
}

/** Re-runs verification in the background after the org name or website changes. */
export async function requestReverification(_db: DbOrTx, _orgId: string): Promise<void> {
  return notImplemented('requestReverification');
}

/** "Ask for a review" after a failed verification: opens an `appeals` item. */
export async function openVerificationAppeal(
  _db: DbOrTx,
  _orgId: string,
  _note: string,
): Promise<void> {
  return notImplemented('openVerificationAppeal');
}

/** SP8 registers these with its privacy exporter and eraser. */
export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export() {
    return notImplemented('privacyHandlers.export');
  },
  async erase() {
    return notImplemented('privacyHandlers.erase');
  },
};

/** W6 replaces the no-op (spec section 6). */
export const jobHandlers: HandlerMap = {
  'verification.run': async () => {},
};
