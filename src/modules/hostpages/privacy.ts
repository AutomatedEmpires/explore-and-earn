// The hostpages privacy hooks (SP2 spec section 10), which SP8 registers with its exporter and
// eraser: a person's follows, and their name on the host pages they edited.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
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
