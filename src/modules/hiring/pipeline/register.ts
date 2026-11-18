// Hires per listing for the host Library row. Registered at module load.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { registerListingStatsProvider } from '@/modules/listings';
import { pipelineEntries } from '../schema';

export async function hiringStats(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, { hires: number }>> {
  const out = new Map<string, { hires: number }>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      listingId: pipelineEntries.listingId,
      n: sql<number>`count(*)::int`,
    })
    .from(pipelineEntries)
    .where(and(inArray(pipelineEntries.listingId, ids), eq(pipelineEntries.status, 'hired')))
    .groupBy(pipelineEntries.listingId);
  for (const row of rows) out.set(row.listingId, { hires: Number(row.n) });
  return out;
}

registerListingStatsProvider('hiring', hiringStats);
