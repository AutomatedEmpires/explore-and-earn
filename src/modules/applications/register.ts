// Module-load registrations (SP4 spec 3.4; plan Task 21), imported by index.ts for their side
// effects: SP3's seeker overlay (the listings the seeker applied to and the hosts they blocked)
// and SP2's listing stats provider (applications per listing). FD-2 removed the resume media
// reference checker: an application never holds an uploaded file.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { registerSeekerOverlay } from '@/modules/discovery';
import { registerListingStatsProvider } from '@/modules/listings';
import { listBlocks } from '@/modules/safety';
import { applications } from './schema';

registerSeekerOverlay({
  /** Applied means any application, whatever its status: a withdrawn one still can't reapply. */
  async appliedListingIds(db, userId, listingIds) {
    if (listingIds !== 'all' && listingIds.length === 0) return new Set();
    const rows = await db
      .select({ listingId: applications.listingId })
      .from(applications)
      .where(
        and(
          eq(applications.seekerUserId, userId),
          listingIds === 'all' ? sql`true` : inArray(applications.listingId, listingIds),
        ),
      );
    return new Set(rows.map((r) => r.listingId));
  },
  async hiddenOrgIds(db, userId) {
    const blocks = await listBlocks(db, { type: 'user', id: userId });
    return blocks.filter((b) => b.target.type === 'org').map((b) => b.target.id);
  },
});

registerListingStatsProvider('applications', async (db, ids) => {
  const out = new Map<string, { applications: number }>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ listingId: applications.listingId, n: sql<number>`count(*)::int` })
    .from(applications)
    .where(inArray(applications.listingId, ids))
    .groupBy(applications.listingId);
  for (const r of rows) out.set(r.listingId, { applications: r.n });
  return out;
});
