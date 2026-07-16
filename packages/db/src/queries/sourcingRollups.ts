import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";

/**
 * Read-side rollups over the sourced-inventory lifecycle (founder charter
 * 2026-07-14, provenance lane): the sourcing funnel from `public.events`, and
 * inventory/quality snapshots from `public.listings` + `public.source_import_runs`
 * (migration 064_listing_provenance.sql).
 *
 * DEGRADATION IS THE CONTRACT HERE, NOT AN EDGE CASE: migration 064 may not be
 * applied to a live DB yet (source_import_runs, listings.provenance, etc. may
 * not exist), and `events` may simply have no rows. Every export below is a
 * dashboard/reporting read — it MUST degrade to zeros/empty on any failure
 * (missing table, missing column, network error) rather than throw, so a
 * rollup widget never takes down the page it's on.
 */

/** Untyped Supabase handle (provenance columns/tables predate types.gen). */
function admin(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------- funnel read */

/** Event types that make up the sourcing funnel, in `events.event_type`. */
const FUNNEL_EVENT_TYPES = [
  "sourced_listing_viewed",
  "sourced_listing_matched",
  "sourced_listing_source_clicked",
  "listing_claim_initiated",
  "listing_claim_approved",
  "listing_claim_rejected",
  "listing_claim_converted",
] as const;

export interface SourcingFunnelRollup {
  readonly windowDays: number;
  readonly sourcedViewed: number;
  readonly sourcedMatched: number;
  readonly sourceClicks: number;
  readonly claimsInitiated: number;
  readonly claimsApproved: number;
  readonly claimsRejected: number;
  readonly claimsConverted: number;
}

function zeroFunnel(windowDays: number): SourcingFunnelRollup {
  return {
    windowDays,
    sourcedViewed: 0,
    sourcedMatched: 0,
    sourceClicks: 0,
    claimsInitiated: 0,
    claimsApproved: 0,
    claimsRejected: 0,
    claimsConverted: 0,
  };
}

/**
 * Sourcing funnel counts over the trailing `windowDays`. One query
 * (`event_type IN (...) AND occurred_at >= since`), counted by type in JS.
 * Degrades to an all-zero rollup on any read failure — never throws.
 */
export async function getSourcingFunnelRollup(
  windowDays = 30,
): Promise<SourcingFunnelRollup> {
  try {
    const since = new Date(Date.now() - windowDays * MS_PER_DAY).toISOString();

    const { data, error } = await admin()
      .from("events")
      .select("event_type")
      .in("event_type", FUNNEL_EVENT_TYPES)
      .gte("occurred_at", since);

    if (error || !data) return zeroFunnel(windowDays);

    const counts = new Map<string, number>();
    for (const row of data as Array<{ event_type: string }>) {
      counts.set(row.event_type, (counts.get(row.event_type) ?? 0) + 1);
    }

    return {
      windowDays,
      sourcedViewed: counts.get("sourced_listing_viewed") ?? 0,
      sourcedMatched: counts.get("sourced_listing_matched") ?? 0,
      sourceClicks: counts.get("sourced_listing_source_clicked") ?? 0,
      claimsInitiated: counts.get("listing_claim_initiated") ?? 0,
      claimsApproved: counts.get("listing_claim_approved") ?? 0,
      claimsRejected: counts.get("listing_claim_rejected") ?? 0,
      claimsConverted: counts.get("listing_claim_converted") ?? 0,
    };
  } catch {
    return zeroFunnel(windowDays);
  }
}

/* --------------------------------------------------------- inventory read */

export interface SourcedInventoryRollup {
  readonly liveSourced: number;
  readonly liveVerified: number;
  readonly convertedTotal: number;
  /** Live sourced listings not seen at the source for 45+ days. */
  readonly staleSourced: number;
}

const STALE_AFTER_DAYS = 45;

function zeroInventory(): SourcedInventoryRollup {
  return { liveSourced: 0, liveVerified: 0, convertedTotal: 0, staleSourced: 0 };
}

/**
 * Live-inventory snapshot from `listings`: how much is sourced vs.
 * host-verified, how much has converted end-to-end, and how much sourced
 * inventory has gone stale (no longer confirmed present at its source).
 * Four small head-only count queries. Degrades to all zeros on any failure.
 */
export async function getSourcedInventoryRollup(
  nowMs: number = Date.now(),
): Promise<SourcedInventoryRollup> {
  try {
    const db = admin();
    const staleCutoff = new Date(nowMs - STALE_AFTER_DAYS * MS_PER_DAY).toISOString();

    const [liveSourced, liveVerified, convertedTotal, staleSourced] = await Promise.all([
      db
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "live")
        .eq("provenance", "sourced"),
      db
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "live")
        .eq("provenance", "verified"),
      db
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("claim_summary", "converted"),
      db
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "live")
        .eq("provenance", "sourced")
        .lt("source_last_seen_at", staleCutoff),
    ]);

    if (liveSourced.error || liveVerified.error || convertedTotal.error || staleSourced.error) {
      return zeroInventory();
    }

    return {
      liveSourced: liveSourced.count ?? 0,
      liveVerified: liveVerified.count ?? 0,
      convertedTotal: convertedTotal.count ?? 0,
      staleSourced: staleSourced.count ?? 0,
    };
  } catch {
    return zeroInventory();
  }
}

/* -------------------------------------------------------- import quality */

export interface SourceQualityRow {
  readonly sourceId: string;
  readonly received: number;
  readonly inserted: number;
  readonly rejected: number;
  readonly durationMs: number | null;
  readonly finishedAt: string | null;
}

/** Read a non-negative finite number off a jsonb stats blob, defaulting to 0. */
function parseStatCount(stats: unknown, key: string): number {
  if (!stats || typeof stats !== "object") return 0;
  const value = (stats as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The most recent `source_import_runs`, newest first, with stats parsed
 * defensively (missing/malformed counters read as 0). Degrades to an empty
 * array on any failure — never throws.
 */
export async function getRecentImportRunStats(
  limit = 20,
): Promise<SourceQualityRow[]> {
  try {
    const { data, error } = await admin()
      .from("source_import_runs")
      .select("id, source_id, stats, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return (data as Array<Record<string, unknown>>).map((row) => {
      const startedMs =
        typeof row.started_at === "string" ? Date.parse(row.started_at) : NaN;
      const finishedAt = typeof row.finished_at === "string" ? row.finished_at : null;
      const finishedMs = finishedAt ? Date.parse(finishedAt) : NaN;
      const durationMs =
        Number.isFinite(startedMs) && Number.isFinite(finishedMs)
          ? finishedMs - startedMs
          : null;

      return {
        sourceId: typeof row.source_id === "string" ? row.source_id : String(row.source_id ?? ""),
        received: parseStatCount(row.stats, "received"),
        inserted: parseStatCount(row.stats, "inserted"),
        rejected: parseStatCount(row.stats, "rejected"),
        durationMs,
        finishedAt,
      };
    });
  } catch {
    return [];
  }
}
