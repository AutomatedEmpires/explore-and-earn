// Projection sync from SP2 events, the host fan-out and the nightly drift check (SP3 spec
// section 6). W0 stub: W1 replaces it (Tasks 8 and 9). The handlers acknowledge their topics so
// the worker never dead-letters them before then; the drift check repairs whatever they skip.
import type { Db } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

/** The drift check without paging limits (SP8 restore runbook). */
export async function rebuildSearchProjection(
  _db: Db,
): Promise<{ upserted: number; removed: number }> {
  throw new Error('not implemented: rebuildSearchProjection');
}

const noop = async () => {};

export const syncHandlers: HandlerMap = {
  'discovery.sync_listing': noop,
  'discovery.sync_host': noop,
  'discovery.drift_check': noop,
};
