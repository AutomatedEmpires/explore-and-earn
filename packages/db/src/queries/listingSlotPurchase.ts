import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";

/**
 * Additional-listing add-on I/O (migration 085).
 *
 * Crediting is IDEMPOTENT on the Stripe Checkout Session id, structurally — the
 * unique index on host_listing_slot_purchases.stripe_checkout_session_id is what
 * enforces it, not a procedural check, so Stripe's at-least-once delivery can
 * never double-credit an allowance. Same discipline as 049 (announcements),
 * boostPurchase.ts and 062 (invite packs).
 *
 * PRE-MIGRATION DEGRADATION: before 085 is applied the functions do not exist.
 * Reads return 0 purchased slots (the honest floor: nothing has been credited);
 * crediting returns ok:false so the webhook route treats it as retryable rather
 * than swallowing a paid purchase.
 */

const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

function isMissingFunction(error: { code?: string } | null): boolean {
  return MISSING_FUNCTION_CODES.has(error?.code ?? "");
}

/**
 * The authed host's OWN purchased allowance.
 *
 * Goes through the my_purchased_listing_slots() SECURITY DEFINER function
 * because host_profiles.purchased_listing_slots is deliberately absent from
 * 080's SELECT allow-list — granting the column to `authenticated` would expose
 * every host's add-on spend through host_profiles_select_public.
 *
 * Returns 0 (never throws) pre-085 or on a read fault: an unknown allowance
 * must not widen a cap.
 */
export async function getPurchasedListingSlots(clerkToken: string): Promise<number> {
  try {
    const db = authedClient(clerkToken) as unknown as SupabaseClient;
    const { data, error } = await db.rpc("my_purchased_listing_slots");
    if (error) return 0;
    return typeof data === "number" && Number.isInteger(data) && data > 0 ? data : 0;
  } catch {
    return 0;
  }
}

export interface CreditListingSlotPurchaseResult {
  readonly ok: boolean;
  readonly alreadyCredited: boolean;
}

/**
 * Credit a paid add-on purchase from the Stripe webhook.
 *
 * `ok: false` means "not recorded — redeliver": the webhook route must surface
 * it as a failure so Stripe retries, exactly as recordInvitePackPurchase does.
 * Never throws.
 */
export async function creditListingSlotPurchase(args: {
  readonly hostProfileId: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly tier: string;
  readonly stripeCheckoutSessionId: string;
  readonly stripeSubscriptionId?: string | null;
}): Promise<CreditListingSlotPurchaseResult> {
  if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
    return { ok: false, alreadyCredited: false };
  }
  if (!args.hostProfileId || !args.stripeCheckoutSessionId) {
    return { ok: false, alreadyCredited: false };
  }

  try {
    const admin = adminClient() as unknown as SupabaseClient;
    const { data, error } = await admin.rpc("credit_listing_slot_purchase", {
      p_host_profile_id: args.hostProfileId,
      p_quantity: args.quantity,
      p_unit_amount_cents: Math.max(0, Math.trunc(args.unitAmountCents)),
      p_tier: args.tier,
      p_session_id: args.stripeCheckoutSessionId,
      p_subscription_id: args.stripeSubscriptionId ?? null,
    });
    if (error) {
      // Pre-085 is still "not credited": returning ok would drop a real payment.
      if (isMissingFunction(error)) return { ok: false, alreadyCredited: false };
      return { ok: false, alreadyCredited: false };
    }
    const result = data as { ok?: boolean; already_credited?: boolean } | null;
    if (!result || result.ok !== true) return { ok: false, alreadyCredited: false };
    return { ok: true, alreadyCredited: result.already_credited === true };
  } catch {
    return { ok: false, alreadyCredited: false };
  }
}

export interface SyncListingSlotSubscriptionResult {
  readonly ok: boolean;
  readonly found: boolean;
  readonly changed: boolean;
  /** The allowance this purchase contributes after the sync. */
  readonly slots: number;
}

/**
 * Reconcile an add-on subscription's allowance to what Stripe currently says.
 *
 * `revokeListingSlotPurchase` only covers final cancellation. This covers the
 * two lifecycle states that otherwise leave a host holding an allowance they no
 * longer pay for: a subscription parked in a non-paying status (unpaid,
 * incomplete_expired, paused), and a quantity changed through the billing
 * portal, which only ever surfaces on customer.subscription.updated.
 *
 * `entitled: false` drives the contribution to zero without deleting the ledger
 * row. `found: false` is not an error — the cancelled or updated subscription
 * may be a host plan rather than an add-on. Never throws; `ok: false` means the
 * webhook must fail so Stripe redelivers.
 */
export async function syncListingSlotSubscription(args: {
  readonly stripeSubscriptionId: string;
  /** Stripe's current line quantity; null leaves the recorded quantity alone. */
  readonly quantity: number | null;
  /** Whether the current Stripe status entitles the host to the allowance. */
  readonly entitled: boolean;
}): Promise<SyncListingSlotSubscriptionResult> {
  if (!args.stripeSubscriptionId) {
    return { ok: false, found: false, changed: false, slots: 0 };
  }
  const quantity =
    typeof args.quantity === "number" &&
    Number.isInteger(args.quantity) &&
    args.quantity >= 0
      ? args.quantity
      : null;

  try {
    const admin = adminClient() as unknown as SupabaseClient;
    const { data, error } = await admin.rpc("sync_listing_slot_subscription", {
      p_subscription_id: args.stripeSubscriptionId,
      p_quantity: quantity,
      p_entitled: args.entitled,
    });
    if (error) return { ok: false, found: false, changed: false, slots: 0 };
    const result = data as {
      ok?: boolean;
      found?: boolean;
      changed?: boolean;
      slots?: number;
    } | null;
    if (!result || result.ok !== true) {
      return { ok: false, found: false, changed: false, slots: 0 };
    }
    return {
      ok: true,
      found: result.found === true,
      changed: result.changed === true,
      slots: typeof result.slots === "number" ? result.slots : 0,
    };
  } catch {
    return { ok: false, found: false, changed: false, slots: 0 };
  }
}

export interface RevokeListingSlotPurchaseResult {
  readonly ok: boolean;
  readonly found: boolean;
  readonly alreadyRevoked: boolean;
}

/**
 * Take the allowance back when the add-on subscription ends. Idempotent — a
 * purchase already marked cancelled decrements nothing. `found: false` is not
 * an error: the cancelled subscription may be a host plan rather than an add-on.
 */
export async function revokeListingSlotPurchase(
  stripeSubscriptionId: string,
): Promise<RevokeListingSlotPurchaseResult> {
  if (!stripeSubscriptionId) {
    return { ok: false, found: false, alreadyRevoked: false };
  }
  try {
    const admin = adminClient() as unknown as SupabaseClient;
    const { data, error } = await admin.rpc("revoke_listing_slot_purchase", {
      p_subscription_id: stripeSubscriptionId,
    });
    if (error) return { ok: false, found: false, alreadyRevoked: false };
    const result = data as {
      ok?: boolean;
      found?: boolean;
      already_revoked?: boolean;
    } | null;
    if (!result || result.ok !== true) {
      return { ok: false, found: false, alreadyRevoked: false };
    }
    return {
      ok: true,
      found: result.found === true,
      alreadyRevoked: result.already_revoked === true,
    };
  } catch {
    return { ok: false, found: false, alreadyRevoked: false };
  }
}
