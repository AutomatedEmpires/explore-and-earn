import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SOURCED_STALE_DAYS } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";

/**
 * Sourced-inventory freshness sweep — the scheduled reconciliation that stops
 * stale sourced postings from presenting as current indefinitely.
 *
 * SAFETY LAWS:
 *  - operates ONLY on provenance='sourced' rows. A VERIFIED listing (including
 *    one converted from a source) is NEVER expired here — a host's own listing
 *    does not go stale because its origin posting vanished.
 *  - listings the source has explicitly withdrawn (source_status='withdrawn')
 *    are left to their own flow.
 *  - listings with an IN-FLIGHT claim (claim_summary='claim_pending') are
 *    skipped: closing a listing mid-review would strand a real employer's
 *    claim. The claim decision (or its terminal states) releases the hold and
 *    the next sweep picks the row up normally.
 *  - it CLOSES stale rows (status 'live'→'closed', source_status 'stale'), a
 *    reversible lifecycle state — it never deletes, so import reconciliation
 *    and lineage stay intact.
 */

function db(serviceRoleKey?: string): SupabaseClient {
  return adminClient(serviceRoleKey) as unknown as SupabaseClient;
}

export interface SweepStaleSourcedResult {
  readonly ok: boolean;
  readonly closed: number;
  readonly ids: readonly string[];
  readonly error?: string;
}

/**
 * Close live sourced listings not observed for SOURCED_STALE_DAYS. Idempotent:
 * a row already closed/removed is filtered out by the status predicate.
 */
export async function sweepStaleSourcedListings(
  serviceRoleKey?: string,
  nowMs: number = Date.now(),
): Promise<SweepStaleSourcedResult> {
  const client = db(serviceRoleKey);
  const cutoffIso = new Date(nowMs - SOURCED_STALE_DAYS * 86_400_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  try {
    const { data, error } = await client
      .from("listings")
      .update({
        status: "closed",
        source_status: "stale",
        closed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("provenance", "sourced")
      .eq("status", "live")
      // Only ACTIVE source rows go stale — withdrawn/removed rows carry a
      // terminal semantic the sweep must never overwrite (review 2026-07-23;
      // previously the docstring promised this but the predicate didn't).
      .eq("source_status", "active")
      .neq("claim_summary", "claim_pending")
      .lt("source_last_seen_at", cutoffIso)
      .select("id");
    if (error) return { ok: false, closed: 0, ids: [], error: error.message };
    const ids = ((data ?? []) as Array<{ id: string }>).map((row) => String(row.id));
    return { ok: true, closed: ids.length, ids };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "sweep_failed";
    return { ok: false, closed: 0, ids: [], error: message };
  }
}
