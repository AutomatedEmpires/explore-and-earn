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
  readonly error?: string;
}

async function expireWhere(
  table: "applications" | "invites",
  statuses: readonly string[],
  nowIso: string,
): Promise<number> {
  const { data, error } = await admin()
    .from(table)
    .update({ status: "expired" })
    .in("status", [...statuses])
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .select("id");
  if (error) throw new Error(`sweepExpiredLifecycles(${table}): ${error.message}`);
  return (data ?? []).length;
}

export async function sweepExpiredLifecycles(
  nowIso: string = new Date().toISOString(),
): Promise<LifecycleExpirySweepResult> {
  try {
    const applicationsExpired = await expireWhere(
      "applications",
      ["applied", "reviewing", "saved_by_host"],
      nowIso,
    );
    const offersExpired = await expireWhere("applications", ["offered"], nowIso);
    const invitesExpired = await expireWhere(
      "invites",
      ["created", "delivered", "viewed"],
      nowIso,
    );
    return { ok: true, applicationsExpired, offersExpired, invitesExpired };
  } catch (error) {
    return {
      ok: false,
      applicationsExpired: 0,
      offersExpired: 0,
      invitesExpired: 0,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}
