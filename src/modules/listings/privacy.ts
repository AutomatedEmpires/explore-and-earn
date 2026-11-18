// Privacy hooks (spec section 10): SP8 registers these with its exporter and eraser. Listings
// belong to the org and are retained (they are tied to applications); a user's own trace on them
// is removed.
import { and, asc, count, eq, notInArray, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { EraseResult, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { closeAllForOrg } from './enforce';
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

const some = async (rows: Promise<unknown[]>) => (await rows).length > 0;

export const privacyHandler: PrivacyHandler = {
  module: 'listings',
  tables: ['listings', 'listing_revisions', 'photo_slot_checks'],
  mediaColumns: [
    { table: 'listings', column: 'draft_media_ids', array: true },
    { table: 'listing_revisions', column: 'content_media_ids', array: true },
    { table: 'listing_revisions', column: 'cover_media_id', array: false },
    { table: 'photo_slot_checks', column: 'media_id', array: false },
  ],

  /** The listings the person created: what they wrote for a host, not the host's other listings. */
  async exportData(db, s) {
    if (s.kind !== 'user') return { records: { listings: [] }, files: [] };
    const rows = await db
      .select({
        id: listings.id,
        title: listings.title,
        state: listings.state,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .where(eq(listings.createdBy, s.userId))
      .orderBy(asc(listings.createdAt), asc(listings.id));
    return { records: { listings: rows }, files: [] };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    const heldAll = ctx.holds.includes('all');

    if (s.kind === 'user') {
      if (heldAll) {
        const named = await some(
          tx
            .select({ id: listings.id })
            .from(listings)
            .where(or(eq(listings.createdBy, s.userId), eq(listings.lastEditedBy, s.userId)))
            .limit(1),
        );
        const submitted = await some(
          tx
            .select({ id: listingRevisions.id })
            .from(listingRevisions)
            .where(eq(listingRevisions.submittedBy, s.userId))
            .limit(1),
        );
        return {
          erased: 0,
          retained: [
            ...(named ? [{ table: 'listings', reason: 'legal_hold' as const, until: null }] : []),
            ...(submitted
              ? [{ table: 'listing_revisions', reason: 'legal_hold' as const, until: null }]
              : []),
          ],
        };
      }
      // The listing is the organization's. Only who wrote, edited and submitted it is forgotten.
      const touched = await tx
        .update(listings)
        .set({
          createdBy: sql`nullif(${listings.createdBy}, ${s.userId}::uuid)`,
          lastEditedBy: sql`nullif(${listings.lastEditedBy}, ${s.userId}::uuid)`,
        })
        .where(or(eq(listings.createdBy, s.userId), eq(listings.lastEditedBy, s.userId)))
        .returning({ id: listings.id });
      const revisions = await tx
        .update(listingRevisions)
        .set({ submittedBy: null })
        .where(eq(listingRevisions.submittedBy, s.userId))
        .returning({ id: listingRevisions.id });
      return { erased: touched.length + revisions.length, retained: [] };
    }

    const hasListings = await some(
      tx.select({ id: listings.id }).from(listings).where(eq(listings.orgId, s.orgId)).limit(1),
    );
    const hasRevisions = await some(
      tx
        .select({ id: listingRevisions.id })
        .from(listingRevisions)
        .where(eq(listingRevisions.orgId, s.orgId))
        .limit(1),
    );
    const kept = (reason: 'legal_hold' | 'shared_record'): EraseResult['retained'] => [
      ...(hasListings ? [{ table: 'listings', reason, until: null }] : []),
      ...(hasRevisions ? [{ table: 'listing_revisions', reason, until: null }] : []),
    ];
    if (heldAll) return { erased: 0, retained: kept('legal_hold') };

    // The organization is closing: nothing of it stays published, and unpublished drafts go.
    // Published revisions stay, because applications keep a frozen copy of what was applied to.
    const open = and(
      eq(listings.orgId, s.orgId),
      notInArray(listings.state, ['closed', 'removed', 'draft']),
    );
    const [before] = await tx.select({ n: count() }).from(listings).where(open);
    await closeAllForOrg(tx, s.orgId, 'host', ctx.now);
    const [after] = await tx.select({ n: count() }).from(listings).where(open);
    const drafts = await tx
      .update(listings)
      .set({ draft: {} })
      .where(and(eq(listings.orgId, s.orgId), sql`${listings.draft} <> '{}'::jsonb`))
      .returning({ id: listings.id });
    return {
      erased: Math.max(0, (before?.n ?? 0) - (after?.n ?? 0)) + drafts.length,
      retained: kept('shared_record'),
    };
  },
};
export const retentionRules: RetentionRule[] = [];
