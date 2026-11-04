// Listing row hooks (spec section 3): later sub-projects register stats (SP3 views and saves,
// SP4 applications, SP5 hires) and row badges (SP6 "Boosted until [date]") at module load, so
// listings never imports them. With no provider, stats and badges are null.
import type { DbOrTx } from '@/lib/db';
import type { ListingRowBadgeProvider, ListingStats, ListingStatsProvider } from './types';

const statsProviders = new Map<string, ListingStatsProvider>();
const rowBadgeProviders: ListingRowBadgeProvider[] = [];

/** SP3, SP4 and SP5 fill the Library stats; a provider registered again replaces itself. */
export function registerListingStatsProvider(name: string, fn: ListingStatsProvider): void {
  statsProviders.set(name, fn);
}

/** SP6 "Boosted until [date]". */
export function registerListingRowBadgeProvider(fn: ListingRowBadgeProvider): void {
  rowBadgeProviders.push(fn);
}

/** Tests only: forgets every registered provider. */
export function clearListingProviders(): void {
  statsProviders.clear();
  rowBadgeProviders.length = 0;
}

const EMPTY_STATS: ListingStats = { views: 0, saves: 0, applications: 0, hires: 0 };

/** Every provider's stats merged per id, or null for all when no provider is registered. */
export async function loadListingStats(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, ListingStats> | null> {
  if (statsProviders.size === 0) return null;
  const out = new Map<string, ListingStats>(ids.map((id) => [id, { ...EMPTY_STATS }]));
  if (ids.length === 0) return out;
  const results = await Promise.all([...statsProviders.values()].map((fn) => fn(db, ids)));
  for (const result of results) {
    for (const [id, partial] of result) {
      const current = out.get(id);
      if (current) out.set(id, { ...current, ...partial });
    }
  }
  return out;
}

/** The row badge for each id (the first provider that answers wins). */
export async function loadListingBadges(
  db: DbOrTx,
  orgId: string,
  ids: string[],
): Promise<Map<string, { label: string; href: string }>> {
  const out = new Map<string, { label: string; href: string }>();
  if (ids.length === 0 || rowBadgeProviders.length === 0) return out;
  const results = await Promise.all(rowBadgeProviders.map((fn) => fn(db, orgId, ids)));
  for (const result of results) {
    for (const [id, badge] of result) if (!out.has(id)) out.set(id, badge);
  }
  return out;
}
