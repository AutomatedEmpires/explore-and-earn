// Privacy hooks (spec section 10): SP8 registers these with its exporter and eraser. Listings
// belong to the org and are retained (they are tied to applications); a user's own trace on them
// is removed.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { listingRevisions, listings } from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  /** The listings the user created. */
  async export(db, userId) {
    const rows = await db
      .select({
        id: listings.id,
        orgId: listings.orgId,
        title: listings.title,
        state: listings.state,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(eq(listings.createdBy, userId))
      .orderBy(asc(listings.createdAt));
    return { listings: rows };
  },

  /** Clears the user from `created_by`, `last_edited_by` and revisions' `submitted_by`. */
  async erase(db, userId) {
    await db.transaction(async (tx) => {
      await tx.update(listings).set({ createdBy: null }).where(eq(listings.createdBy, userId));
      await tx
        .update(listings)
        .set({ lastEditedBy: null })
        .where(eq(listings.lastEditedBy, userId));
      await tx
        .update(listingRevisions)
        .set({ submittedBy: null })
        .where(eq(listingRevisions.submittedBy, userId));
    });
  },
};
