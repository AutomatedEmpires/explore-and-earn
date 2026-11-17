// Where boost windows come from. SP6 replaces the default, which returns none.
import type { DbOrTx } from '@/lib/db';

export type BoostWindow = { listingId: string; startsAt: Date; endsAt: Date };
export type BoostWindowsSource = (
  db: DbOrTx,
  q: { orgId: string; from: Date; to: Date; listingIds?: string[] },
) => Promise<BoostWindow[]>;

let source: BoostWindowsSource = async () => [];

/** A second call replaces the first. */
export function registerBoostWindowsSource(fn: BoostWindowsSource): void {
  source = fn;
}

export function getBoostWindows(
  db: DbOrTx,
  q: { orgId: string; from: Date; to: Date; listingIds?: string[] },
): Promise<BoostWindow[]> {
  return source(db, q);
}
