import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";

/**
 * Lifecycle expiry sweep — makes LIFECYCLE_EXPIRY_DAYS real.
 *
 * Migration 067 stamps expires_at (application 30d, invite 14d, offer 7d on
 * entering 'offered'); this sweep transitions overdue rows to 'expired' so
 * stale pipelines clear, the on-read expiry UI (InviteActions/OfferedActions)
 * agrees with the database, and dead applications stop counting as live
 * candidacies. Service-role: the sweep spans every host and seeker.
 *
 * Safety properties:
 *   - NULL expires_at rows are never touched (pre-067 rows are backfilled by
 *     the migration itself; a null here means the schema half isn't applied
 *     yet, and expiring on a guess would be dishonest).
 *   - Only forward-legal states are swept; the 001 lifecycle triggers remain
 *     the authoritative edge guard under this UPDATE.
 *   - Counts are exact (RETURNING ids), so the cron response is truthful.
 */

function admin(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

export interface LifecycleExpirySweepResult {
  readonly ok: boolean;
  /** applied/reviewing/saved_by_host rows past their 30-day window. */
  readonly applicationsExpired: number;
  /** offered rows past their 7-day response window. */
  readonly offersExpired: number;
  /** created/delivered/viewed invites past their 14-day window. */
  readonly invitesExpired: number;
  /** proposed/alternate interview requests past their response window. */
  readonly schedulingRequestsExpired: number;
  readonly error?: string;
}

async function expireWhere(
  table: "applications" | "invites" | "scheduling_requests",
  statuses: readonly string[],
  nowIso: string,
  schemaMayBePending = false,
): Promise<number> {
  const { data, error } = await admin()
    .from(table)
    .update({ status: "expired" })
    .in("status", [...statuses])
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .select("id");
  if (error) {
    // Application code can deploy minutes before migration 088 is visible in
    // PostgREST. Scheduling is the only optional bucket in that window; the
    // established lifecycle buckets must still sweep normally.
    if (
      schemaMayBePending &&
      (error.code === "42P01" || error.code === "PGRST205")
    ) {
      return 0;
    }
    throw new Error(`sweepExpiredLifecycles(${table}): ${error.message}`);
  }
  return (data ?? []).length;
}

export async function sweepExpiredLifecycles(
  nowIso: string = new Date().toISOString(),
): Promise<LifecycleExpirySweepResult> {
  // Each PostgREST mutation commits independently. Preserve exact counts for
  // buckets that already completed if a later provider call fails; reporting
  // zeros after committed writes would make the cron response false.
  let applicationsExpired = 0;
  let offersExpired = 0;
  let invitesExpired = 0;
  let schedulingRequestsExpired = 0;
  try {
    applicationsExpired = await expireWhere(
      "applications",
      ["applied", "reviewing", "saved_by_host"],
      nowIso,
    );
    offersExpired = await expireWhere("applications", ["offered"], nowIso);
    invitesExpired = await expireWhere(
      "invites",
      ["created", "delivered", "viewed"],
      nowIso,
    );
    schedulingRequestsExpired = await expireWhere(
      "scheduling_requests",
      ["proposed", "alternate_requested"],
      nowIso,
      true,
    );
    return {
      ok: true,
      applicationsExpired,
      offersExpired,
      invitesExpired,
      schedulingRequestsExpired,
    };
  } catch (error) {
    return {
      ok: false,
      applicationsExpired,
      offersExpired,
      invitesExpired,
      schedulingRequestsExpired,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
