import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, recordEvents } from "@explore-and-earn/db";

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
      const { strong } = await computeAndStoreMatchesForListing(listing.id, nowMs);
      const recipients = strong.filter((recipient) =>
        Boolean(recipient.recipientClerkUserId),
      );
      if (recipients.length > 0) {
        // Persist one REAL match_generated event per strong (listing, seeker)
        // pair; the notification engine expands them into in-app/email/push
        // per each seeker's preferences. In-app dedupe stays compatible with
        // the legacy strong_match:<listingId>:<clerkId> key, so historical
        // alert recipients are never double-notified.
        notified += await recordEvents(
          recipients.map((recipient) => ({
            eventType: "match_generated" as const,
            actorScope: "platform" as const,
            subjectType: "listing",
            subjectId: listing.id,
            listingId: listing.id,
            seekerProfileId: recipient.seekerProfileId,
            sourceSurface: "new_match_alerts_cron",
          })),
        );
      }
    } catch {
      // Resilient: one listing's failure never blocks the rest of the sweep.
    }
  }

  return { listingsProcessed: unscored.length, notified };
}
