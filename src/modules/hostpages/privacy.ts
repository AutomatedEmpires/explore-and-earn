// The hostpages privacy hooks (SP2 spec section 10), which SP8 registers with its exporter and
// eraser: a person's follows, and their name on the host pages they edited.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { EraseResult, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { getOrgSummaries } from '@/modules/orgs';
import { transact } from './editor';
import { hostFollows, hostPages } from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  /** The hosts the person follows (any state), oldest first. */
  async export(db, userId) {
    const rows = await db
      .select({ orgId: hostFollows.orgId, followedAt: hostFollows.createdAt })
      .from(hostFollows)
      .where(eq(hostFollows.userId, userId))
      .orderBy(asc(hostFollows.createdAt), asc(hostFollows.orgId));
    const orgs = await getOrgSummaries(
      db,
      rows.map((r) => r.orgId),
    );
    return {
      follows: rows.map((r) => ({
        orgId: r.orgId,
        name: orgs.get(r.orgId)?.name ?? null,
        slug: orgs.get(r.orgId)?.slug ?? null,
        followedAt: r.followedAt.toISOString(),
      })),
    };
  },

  /** Deletes the person's follows and clears them as the last editor of a host page. */
  async erase(db, userId) {
    await transact(db, async (tx) => {
      await tx.delete(hostFollows).where(eq(hostFollows.userId, userId));
      await tx.update(hostPages).set({ updatedBy: null }).where(eq(hostPages.updatedBy, userId));
    });
  },
};

const some = async (rows: Promise<unknown[]>) => (await rows).length > 0;

export const privacyHandler: PrivacyHandler = {
  module: 'hostpages',
  tables: ['host_pages', 'host_follows'],
  mediaColumns: [
    { table: 'host_pages', column: 'content_media_ids', array: true },
    { table: 'host_pages', column: 'pending_media_ids', array: true },
  ],

  /** The hosts the person follows. */
  async exportData(db, s) {
    if (s.kind !== 'user') return { records: { follows: [] }, files: [] };
    const rows = await db
      .select({ orgId: hostFollows.orgId, followedAt: hostFollows.createdAt })
      .from(hostFollows)
      .where(eq(hostFollows.userId, s.userId))
      .orderBy(asc(hostFollows.createdAt), asc(hostFollows.orgId));
    const orgs = await getOrgSummaries(
      db,
      rows.map((row) => row.orgId),
    );
    return {
      records: {
        follows: rows.map((row) => ({
          orgName: orgs.get(row.orgId)?.name ?? null,
          followedAt: row.followedAt,
        })),
      },
      files: [],
    };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    const heldAll = ctx.holds.includes('all');
    const follows =
      s.kind === 'user' ? eq(hostFollows.userId, s.userId) : eq(hostFollows.orgId, s.orgId);
    const pages =
      s.kind === 'user' ? eq(hostPages.updatedBy, s.userId) : eq(hostPages.orgId, s.orgId);

    if (heldAll) {
      const hasFollows = await some(
        tx.select({ orgId: hostFollows.orgId }).from(hostFollows).where(follows).limit(1),
      );
      const hasPages = await some(
        tx.select({ orgId: hostPages.orgId }).from(hostPages).where(pages).limit(1),
      );
      return {
        erased: 0,
        retained: [
          ...(hasPages ? [{ table: 'host_pages', reason: 'legal_hold' as const, until: null }] : []),
          ...(hasFollows
            ? [{ table: 'host_follows', reason: 'legal_hold' as const, until: null }]
            : []),
        ],
      };
    }

    const unfollowed = await tx
      .delete(hostFollows)
      .where(follows)
      .returning({ orgId: hostFollows.orgId });
    // A person only leaves a trace on a page they edited; a closing organization's page goes.
    const changed =
      s.kind === 'user'
        ? await tx
            .update(hostPages)
            .set({ updatedBy: null })
            .where(pages)
            .returning({ orgId: hostPages.orgId })
        : await tx.delete(hostPages).where(pages).returning({ orgId: hostPages.orgId });
    return { erased: unfollowed.length + changed.length, retained: [] };
  },
};
export const retentionRules: RetentionRule[] = [];
