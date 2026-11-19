// What the privacy module may call on other modules. The orgs import is dynamic so loading
// this file does not pull the orgs barrel while entitlements is still starting.
import type { DbOrTx } from '@/lib/db';
import type { getOwnershipSummary as OwnershipSummary } from '@/modules/orgs';

export const getOwnershipSummary: typeof OwnershipSummary = async (db: DbOrTx, userId: string) => {
  const orgs = await import('@/modules/orgs');
  return orgs.getOwnershipSummary(db, userId);
};
