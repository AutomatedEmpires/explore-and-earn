import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";
import { searchListings, type ListingRow, type SearchFilters } from "./listings";
import { savedSearchToQueryString, type SavedSearchFilters } from "./savedSearches";

/**
 * Saved-search alert worker — the seeker re-engagement flywheel.
 *
 * A seeker saves a triad-first search (housing / meals / pay floor / lane /
 * start window / location); this worker periodically finds LIVE listings that
 * newly match it (published since the seeker last saw the search) and drops an
 * in-app notification so they come back. Service-role throughout (cross-user
 * writes + all-seeker scan), invoked by the /api/cron/saved-search-alerts route.
 *
 * Deterministic + resilient: every seeker is processed independently and a
 * failure on one never blocks the rest.
 */

function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** How many enabled saved searches to process per run (bounded work). */
const ALERT_BATCH_CAP = 300;
/** Max listings surfaced by a saved search's re-run before we filter to new. */
const SEARCH_LIMIT = 30;

export interface SavedSearchAlertJob {
  readonly savedSearchId: string;
  readonly label: string;
  readonly filters: SavedSearchFilters;
  /** High-water mark: newest listing we've already alerted about (null = never). */
  readonly lastAlertedAt: string | null;
  /** Baseline for a never-alerted search: only alert on listings newer than this. */
  readonly createdAt: string;
  readonly recipientClerkUserId: string | null;
}

/** Map the saved-search filter shape onto the discovery searchListings filters. */
export function mapSavedFiltersToSearch(filters: SavedSearchFilters): SearchFilters {
  return {
    query: filters.q,
    categories: filters.category ? [filters.category] : undefined,
    hasHousing: filters.housing,
    hasMeals: filters.meals,
    visaSupport: filters.visa,
    startRangeMonths:
      filters.startRangeMonths === 1 || filters.startRangeMonths === 3 || filters.startRangeMonths === 6
        ? filters.startRangeMonths
        : undefined,
    payMin: filters.payMin,
    payUnit: filters.payUnit as SearchFilters["payUnit"],
    location: filters.location,
    limit: SEARCH_LIMIT,
  };
}

/**
 * Pure: the listings published strictly after `sinceIso` — i.e. new since the
 * seeker last saw this search. When `sinceIso` is null/invalid, nothing is new
 * (the caller uses the saved-search createdAt as the floor instead).
 */
export function selectNewListings(
  rows: readonly ListingRow[],
  sinceIso: string | null,
): ListingRow[] {
  if (!sinceIso) return [];
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return [];
  return rows.filter((row) => {
    const published = row.published_at ? Date.parse(row.published_at) : NaN;
    return !Number.isNaN(published) && published > since;
  });
}

/** Load enabled saved searches + their recipient (seeker's Clerk id), service-role. */
export async function getEnabledSavedSearchesForAlerts(
  limit: number = ALERT_BATCH_CAP,
): Promise<SavedSearchAlertJob[]> {
  const { data, error } = await db()
    .from("saved_searches")
    .select("id, label, filters, created_at, last_alerted_at, seeker_profiles(clerk_user_id)")
    .eq("alert_enabled", true)
    .order("last_alerted_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((raw) => {
    const seeker = Array.isArray(raw.seeker_profiles)
      ? (raw.seeker_profiles[0] as Record<string, unknown> | undefined)
      : (raw.seeker_profiles as Record<string, unknown> | undefined);
    return {
      savedSearchId: String(raw.id),
      label: typeof raw.label === "string" ? raw.label : "your search",
      filters: (raw.filters as SavedSearchFilters | null) ?? {},
      lastAlertedAt: typeof raw.last_alerted_at === "string" ? raw.last_alerted_at : null,
      createdAt: typeof raw.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
      recipientClerkUserId:
        seeker && typeof seeker.clerk_user_id === "string" ? seeker.clerk_user_id : null,
    } satisfies SavedSearchAlertJob;
  });
}

async function insertSavedSearchAlert(
  job: SavedSearchAlertJob,
  newCount: number,
): Promise<void> {
  if (!job.recipientClerkUserId) return;
  const qs = savedSearchToQueryString(job.filters);
  await db().from("notifications").insert({
    recipient_user_id: null,
    recipient_clerk_user_id: job.recipientClerkUserId,
    category: "system",
    priority: "informational",
    channel: "in_app",
    title:
      newCount === 1
        ? `1 new match for "${job.label}"`
        : `${newCount} new matches for "${job.label}"`,
    body: `New opportunities match your saved search "${job.label}". Take a look before they fill.`,
    subject_type: "saved_search",
    subject_id: job.savedSearchId,
    action_url: qs ? `/seek?${qs}` : "/seek",
  });
}

export interface SavedSearchAlertRunResult {
  readonly processed: number;
  readonly alerted: number;
  readonly listingsMatched: number;
}

/** One saved search's fresh-results batch, handed to a delivery callback. */
export interface SavedSearchAlertBatch {
  readonly job: SavedSearchAlertJob;
  readonly newCount: number;
  /** The high-water mark this batch was computed against (stable window id). */
  readonly floorIso: string;
  /** Query-string form of the saved filters (for the destination link). */
  readonly queryString: string;
}

/**
 * Process every enabled saved search: re-run it, alert on newly-published
 * matches, and advance the high-water mark. Best-effort per search.
 *
 * `deliver` (optional) replaces the legacy direct in-app insert — the web
 * layer passes the notification engine's enqueue so saved-search alerts get
 * preferences/quiet-hours/dedup across channels. Without it, the legacy
 * in-app insert keeps working (back-compat).
 */
export async function runSavedSearchAlerts(
  nowIso: string = new Date().toISOString(),
  deliver?: (batch: SavedSearchAlertBatch) => Promise<void>,
): Promise<SavedSearchAlertRunResult> {
  const jobs = await getEnabledSavedSearchesForAlerts();
  let alerted = 0;
  let listingsMatched = 0;

  for (const job of jobs) {
    try {
      if (!job.recipientClerkUserId) continue;
      const rows = await searchListings(mapSavedFiltersToSearch(job.filters));
      const floor = job.lastAlertedAt ?? job.createdAt;
      const fresh = selectNewListings(rows, floor);

      // Always advance the high-water mark so the next run only considers newer
      // listings — even when there was nothing new this time.
      await db()
        .from("saved_searches")
        .update({ last_alerted_at: nowIso })
        .eq("id", job.savedSearchId);

      if (fresh.length > 0) {
        if (deliver) {
          await deliver({
            job,
            newCount: fresh.length,
            floorIso: floor,
            queryString: savedSearchToQueryString(job.filters),
          });
        } else {
          await insertSavedSearchAlert(job, fresh.length);
        }
        alerted += 1;
        listingsMatched += fresh.length;
      }
    } catch {
      // Resilient: one bad saved search never blocks the rest of the batch.
    }
  }

  return { processed: jobs.length, alerted, listingsMatched };
}
