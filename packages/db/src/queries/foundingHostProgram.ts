import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";
import { anonClient } from "../client";

/**
 * The founding-host program (migration 087, commercial redesign D10).
 *
 * THE ONE RULE THIS MODULE EXISTS TO KEEP: a surface may not state a number
 * about this program that the database did not give it. The program was a term
 * sheet with no code path for months — a lifetime-locked rate offered to a fixed
 * number of early hosts, with nothing counting a claim — and the guardrail
 * answered by banning the words. Making it real means the count, the capacity
 * and the deadline all come from one row, read here, and absence of that row is
 * a first-class state rather than an error.
 *
 * The read goes through the ANON client on purpose. anon holds SELECT on exactly
 * capacity / claimed / enrollment_deadline / status (087), so this read is
 * incapable of returning anything a visitor could not already see — a service
 * -role read would work too and would quietly widen what a rendering bug could
 * leak. The write path and the claim path are service-role only and are the
 * separate functions below.
 */

export type FoundingProgramStatus = "draft" | "open" | "full" | "ended";

export interface FoundingHostProgram {
  readonly capacity: number;
  readonly claimed: number;
  /** ISO timestamp, or null while the founder has not set one. */
  readonly enrollmentDeadline: string | null;
  readonly status: FoundingProgramStatus;
}

const PROGRAM_STATUSES: readonly FoundingProgramStatus[] = [
  "draft",
  "open",
  "full",
  "ended",
];

function toStatus(value: unknown): FoundingProgramStatus {
  return typeof value === "string" &&
    (PROGRAM_STATUSES as readonly string[]).includes(value)
    ? (value as FoundingProgramStatus)
    : // An unrecognised status is not an invitation to guess. 'draft' is the
      // state in which no surface renders a number, so an unreadable value
      // collapses to silence rather than to an offer.
      "draft";
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

/**
 * The configured program, or null when the founder has not configured one.
 *
 * NULL IS THE SHIPPED STATE and is not an error: migration 087 seeds no row.
 * A READ FAILURE also answers null, and that is deliberate in this one
 * direction — the caller's only use for this value is deciding whether to render
 * a scarcity claim, and the safe reading of "I could not consult the authority"
 * is "say nothing", never "show the last thing I remember". Nothing downstream
 * grants an entitlement from this read; the seat is consumed by
 * claimFoundingHostSeat, which is the only function that may not fail quiet.
 */
export async function getFoundingHostProgram(): Promise<FoundingHostProgram | null> {
  try {
    const db = anonClient() as unknown as SupabaseClient;
    const { data, error } = await db
      .from("founding_host_program")
      .select("capacity, claimed, enrollment_deadline, status")
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    const capacity = toCount(row.capacity);
    const claimed = toCount(row.claimed);

    return {
      capacity,
      // Never above capacity, whatever a mid-flight data fix is doing. The
      // database CHECK already holds this; the floor here means a rendering
      // surface can subtract without producing a negative remainder.
      claimed: Math.min(claimed, capacity),
      enrollmentDeadline:
        typeof row.enrollment_deadline === "string" ? row.enrollment_deadline : null,
      status: toStatus(row.status),
    };
  } catch {
    return null;
  }
}

export type FoundingClaimResult =
  | { readonly ok: true; readonly alreadyClaimed: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * Consume one founding seat for a Clerk identity.
 *
 * Called from ONE place: the Stripe grant path, after the money is confirmed.
 * The function behind it is service-role only, takes a per-program advisory
 * lock, and is idempotent per identity — so a redelivered webhook answers
 * alreadyClaimed rather than taking a second seat.
 *
 * A refusal is a RESULT, not an exception, because the caller has already
 * granted a paid tier by the time it runs: throwing here would answer Stripe
 * non-2xx and force a redelivery of a grant that succeeded. A transport failure
 * IS surfaced as ok:false with a reason, so the caller can record it — silence
 * is the one outcome that is never correct here.
 */
export async function claimFoundingHostSeat(
  clerkUserId: string,
): Promise<FoundingClaimResult> {
  if (!clerkUserId) return { ok: false, reason: "missing_identity" };

  try {
    const db = adminClient() as unknown as SupabaseClient;
    const { data, error } = await db.rpc("claim_founding_host_seat", {
      p_clerk_user_id: clerkUserId,
    });

    if (error) return { ok: false, reason: "claim_unavailable" };

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok === true) {
      return { ok: true, alreadyClaimed: result.already_claimed === true };
    }
    return {
      ok: false,
      reason: typeof result.reason === "string" ? result.reason : "claim_refused",
    };
  } catch {
    return { ok: false, reason: "claim_unavailable" };
  }
}

/**
 * Record a paid checkout whose seat claim was refused.
 *
 * The race is real and the money makes it consequential: a host can open a
 * founding checkout while seats remain and settle after the last one is gone.
 * Refusing the entitlement would take their money for nothing; incrementing past
 * capacity would break the count the public page is quoting. So the tier is
 * granted and the over-subscription is written down. Idempotent per Stripe
 * Checkout Session.
 */
export async function recordFoundingClaimDiscrepancy(input: {
  readonly clerkUserId: string;
  readonly reason: string;
  readonly stripeCheckoutSessionId?: string | null;
}): Promise<boolean> {
  if (!input.clerkUserId || !input.reason) return false;

  try {
    const db = adminClient() as unknown as SupabaseClient;
    const { error } = await db.rpc("record_founding_claim_discrepancy", {
      p_clerk_user_id: input.clerkUserId,
      p_reason: input.reason,
      p_session_id: input.stripeCheckoutSessionId ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

export interface FoundingProgramConfigInput {
  readonly capacity: number;
  /** ISO timestamp, or null to clear the deadline (which closes claiming). */
  readonly enrollmentDeadline: string | null;
  readonly status: FoundingProgramStatus;
}

/**
 * Write the singleton configuration. Service role only, and the ONLY writer of
 * capacity / deadline / status — `claimed` is deliberately absent from this
 * shape, because the claim count is evidence, not configuration. An admin who
 * could set it could publish a scarcity figure with no claims behind it.
 */
export async function upsertFoundingHostProgram(
  input: FoundingProgramConfigInput,
): Promise<{ ok: boolean; error?: string }> {
  const db = adminClient() as unknown as SupabaseClient;
  const { error } = await db.from("founding_host_program").upsert(
    {
      id: 1,
      capacity: input.capacity,
      enrollment_deadline: input.enrollmentDeadline,
      status: input.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface FoundingClaimDiscrepancy {
  readonly id: string;
  readonly clerkUserId: string;
  readonly reason: string;
  readonly stripeCheckoutSessionId: string | null;
  readonly notedAt: string;
}

/**
 * Unresolved over-subscriptions, oldest first. The admin console's whole reason
 * for reading this is that an over-subscription must be somebody's problem
 * rather than a line in a log nobody opens.
 */
export async function getOpenFoundingClaimDiscrepancies(): Promise<
  readonly FoundingClaimDiscrepancy[]
> {
  try {
    const db = adminClient() as unknown as SupabaseClient;
    const { data, error } = await db
      .from("founding_host_claim_discrepancies")
      .select("id, clerk_user_id, reason, stripe_checkout_session_id, noted_at")
      .is("resolved_at", null)
      .order("noted_at", { ascending: true })
      .limit(50);

    if (error || !data) return [];

    return (data as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      clerkUserId: String(row.clerk_user_id),
      reason: String(row.reason),
      stripeCheckoutSessionId:
        typeof row.stripe_checkout_session_id === "string"
          ? row.stripe_checkout_session_id
          : null,
      notedAt: String(row.noted_at),
    }));
  } catch {
    return [];
  }
}
