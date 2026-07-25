"use server";

import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authedClient, recordEvent } from "@explore-and-earn/db";

import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";

export type DeletionScope = "host" | "seeker";

export interface DeletionRequestResult {
  readonly ok: boolean;
  readonly error?: "unauthenticated" | "rate_limited" | "failed";
  /** True when an open request already existed — the promise still holds. */
  readonly alreadyOpen?: boolean;
}

/**
 * Record an account-erasure request.
 *
 * This exists because the UI previously opened a `mailto:` and then declared
 * "Deletion request received. Our team will process it within 5 business days"
 * unconditionally. Nothing was stored: a user with no mail client, or who
 * closed the compose window, was told their request had been received when no
 * one had received anything, and the platform kept no evidence that an erasure
 * request had ever arrived — which is the thing a statutory deadline is
 * measured against.
 *
 * The row is written BEFORE the UI is allowed to confirm. Deleting data is
 * deliberately NOT done here: a host may have live listings, in-flight
 * applications or payment obligations, so erasure stays a reviewed operation.
 * What this guarantees is that the request is durable, attributable and
 * timed — not that it is instant.
 */
export async function requestAccountDeletionAction(
  scope: DeletionScope,
  displayLabel?: string,
  requesterNote?: string,
): Promise<DeletionRequestResult> {
  try {
    const { userId, getToken } = await auth();
    if (!userId) return { ok: false, error: "unauthenticated" };

    // Deliberately generous: this is a rare, deliberate action. The cap only
    // stops a scripted flood of rows.
    const { allowed } = await checkRateLimitDistributed(
      `account-deletion:${userId}`,
      5,
      60 * 60 * 1000,
    );
    if (!allowed) return { ok: false, error: "rate_limited" };

    const token = await getToken();
    if (!token) return { ok: false, error: "unauthenticated" };

    // account_deletion_requests postdates types.gen.ts, so the generated client
    // types do not know the table yet.
    const db = authedClient(token) as unknown as SupabaseClient;
    const { error } = await db.from("account_deletion_requests").insert({
      clerk_user_id: userId,
      subject_scope: scope,
      display_label: displayLabel?.slice(0, 200) ?? null,
      requester_note: requesterNote?.slice(0, 2000) ?? null,
    });

    if (error) {
      // 23505 = the partial unique index: an open request already exists. That
      // is success from the person's point of view — we have their request —
      // so it must not surface as a failure that invites them to try again.
      if (error.code === "23505") {
        return { ok: true, alreadyOpen: true };
      }
      reportError(new Error(`account deletion request insert: ${error.message}`), {
        action: "requestAccountDeletionAction",
        userId,
      });
      return { ok: false, error: "failed" };
    }

    // Append-only log, separate from the row, so "when were we told" survives
    // any later edit to the request itself. Best-effort by contract.
    await recordEvent({
      eventType: "account_deletion_requested",
      actorScope: scope === "host" ? "host" : "seeker",
      subjectType: "account",
      subjectId: userId,
      sourceSurface: "account_settings",
    });

    return { ok: true };
  } catch (error) {
    reportError(error, { action: "requestAccountDeletionAction" });
    return { ok: false, error: "failed" };
  }
}
