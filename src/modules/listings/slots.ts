// The listing_slot usage counter (spec section 4): a listing in review or active holds a slot.
// Registered when the module loads (index imports this file), so billing's and entitlements'
// capacity checks count slots without importing listings.
import { and, count, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { registerUsageCounter } from '@/modules/entitlements';
import { listings } from './schema';

export const SLOT_HOLDING_STATES = ['in_review', 'active'] as const;

/** Listings of `orgId` that hold a slot. */
export async function countSlotHolders(db: DbOrTx, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(listings)
    .where(and(eq(listings.orgId, orgId), inArray(listings.state, [...SLOT_HOLDING_STATES])));
  return Number(row?.n ?? 0);
}

registerUsageCounter('listing_slot', countSlotHolders);
