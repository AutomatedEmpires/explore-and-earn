import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, insertStrongMatchNotifications } from "@explore-and-earn/db";

import { computeAndStoreMatchesForListing } from "./index";

/**
 * New-strong-match alert worker — proactive, fit-based re-engagement.
 *
 * The complement to the saved-search worker (filter-based): when a great new
 * listing posts, the seekers it *strongly* matches (ADR-040 engine) should hear
 * about it. Service-role throughout, invoked by /api/cron/new-match-alerts.
 *
 * Dedupe is structural: a listing is "already processed" once it has any
 * match_scores rows (from this worker or from compute-on-apply), so it is scored
 * + blasted at most once. Per-recipient dedupe_key prevents double-notifying.
 */

function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** Only consider listings published within this window (bounds work + relevance). */
const LOOKBACK_HOURS = 48;
/** Max recently-published listings inspected per run. */
const LISTING_CAP = 100;

/** Pure: the recent listings not yet present in match_scores (i.e. unprocessed). */
export function selectUnscoredListings(
  recent: ReadonlyArray<{ id: string; title: string }>,
  scoredListingIds: ReadonlySet<string>,
): Array<{ id: string; title: string }> {
  return recent.filter((listing) => !scoredListingIds.has(listing.id));
}

export interface NewMatchAlertRunResult {
  readonly listingsProcessed: number;
  readonly notified: number;
}

/**
 * Score newly-published listings that haven't been processed yet and notify the
 * seekers who strongly match them. Best-effort per listing.
 */
export async function runNewMatchAlerts(
  nowMs: number = Date.now(),
): Promise<NewMatchAlertRunResult> {
  const client = db();
  const cutoff = new Date(nowMs - LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data: recentRows } = await client
    .from("listings")
    .select("id, title, published_at")
    .eq("status", "live")
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(LISTING_CAP);
  const recent = ((recentRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
  }));
  if (recent.length === 0) return { listingsProcessed: 0, notified: 0 };

  const { data: scoredRows } = await client
    .from("match_scores")
    .select("listing_id")
    .in(
      "listing_id",
      recent.map((listing) => listing.id),
    );
  const scoredIds = new Set(
    ((scoredRows ?? []) as Array<{ listing_id: string }>).map((row) => String(row.listing_id)),
  );

  const unscored = selectUnscoredListings(recent, scoredIds);

  let notified = 0;
  for (const listing of unscored) {
    try {
      const { strong, listingTitle } = await computeAndStoreMatchesForListing(listing.id, nowMs);
      const recipientClerkUserIds = strong
        .map((recipient) => recipient.recipientClerkUserId)
        .filter((id): id is string => Boolean(id));
      if (recipientClerkUserIds.length > 0) {
        const { inserted } = await insertStrongMatchNotifications({
          listingId: listing.id,
          listingTitle: listingTitle || listing.title,
          recipientClerkUserIds,
        });
        notified += inserted;
      }
    } catch {
      // Resilient: one listing's failure never blocks the rest of the sweep.
    }
  }

  return { listingsProcessed: unscored.length, notified };
}
