import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import { adminClient } from "../adminClient";

// ─────────────────────────────────────────────────────────────────────────────
// Boost PURCHASE (write) queries.
//
// Deliberately separate from queries/boosts.ts (the READ/ranking side). This
// file is the mirror of the host_announcements purchase path: ownership is
// verified with the RLS-scoped authed client (server action), and the campaign
// row is written with the service-role admin client (webhook context, post-
// payment). `listing_boost_campaigns` is not in the generated Supabase types,
// so every call casts the client to an untyped SupabaseClient — same pattern as
// queries/boosts.ts and queries/community.ts.
//
// Schema: 029_boost_campaigns.sql (table) + 046_boost_campaign_purchase.sql
// (stripe_* / purchase_* columns + the 'draft' status). Pricing is founder-
// locked in contracts ADDON_PRICING.boost (ADR-031).
// ─────────────────────────────────────────────────────────────────────────────

/** Boost tiers that may purchase a campaign — mirrors 029's tier CHECK. */
export type BoostPurchaseTier = "starter" | "professional" | "enterprise";

// ─── Ownership verification (server-action context) ──────────────────────────

/**
 * Confirms the given listing belongs to `hostProfileId`, using the RLS-scoped
 * authed client (the host's own Clerk JWT). Returns the listing's status so the
 * caller can refuse to boost a non-live listing. Returns null when the listing
 * does not exist or is not owned by this host.
 */
export async function getOwnedListingForBoost(params: {
  token: string;
  listingId: string;
  hostProfileId: string;
}): Promise<{ id: string; status: string } | null> {
  const db = authedClient(params.token) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("id, status, host_profile_id")
    .eq("id", params.listingId)
    .eq("host_profile_id", params.hostProfileId)
    .maybeSingle();

  if (error) throw new Error(`getOwnedListingForBoost: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; status: string };
  return { id: row.id, status: row.status };
}

// ─── Activation from Stripe Checkout (webhook context) ────────────────────────

export interface ActivateBoostFromCheckoutParams {
  readonly sessionId: string;
  readonly paymentIntentId: string | null;
  readonly listingId: string;
  readonly hostProfileId: string;
  readonly durationDays: number;
  readonly amountCents: number;
  /** Defaults to 'starter' — exposure-only tier; ranking lives in queries/boosts.ts. */
  readonly tier?: BoostPurchaseTier;
}

export interface ActivateBoostResult {
  readonly id: string;
  /** true when a webhook retry hit the existing Checkout-Session row (no-op). */
  readonly alreadyExisted: boolean;
}

/**
 * Inserts an ACTIVE listing-boost campaign from a completed Stripe Checkout
 * Session. Window is computed here: starts_at = now, ends_at = now + duration.
 * Idempotent on stripe_checkout_session_id (Stripe delivers webhooks
 * at-least-once) via the partial unique index from migration 046 — a retry
 * returns the existing row instead of inserting a duplicate.
 *
 * Uses the service-role admin client (bypasses RLS) because the webhook has no
 * user session. Mirrors the announcement activation path.
 */
export async function activateBoostCampaignFromCheckout(
  params: ActivateBoostFromCheckoutParams,
): Promise<ActivateBoostResult> {
  const admin = adminClient() as unknown as SupabaseClient;

  // Idempotency: if a row already exists for this Checkout Session (retry),
  // return it without inserting again.
  const { data: existing, error: lookupError } = await admin
    .from("listing_boost_campaigns")
    .select("id")
    .eq("stripe_checkout_session_id", params.sessionId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`activateBoostCampaignFromCheckout (lookup): ${lookupError.message}`);
  }
  if (existing) {
    return { id: (existing as { id: string }).id, alreadyExisted: true };
  }

  const now = new Date();
  const endsAt = new Date(now.getTime());
  endsAt.setDate(endsAt.getDate() + params.durationDays);

  const { data, error } = await admin
    .from("listing_boost_campaigns")
    .insert({
      listing_id:                 params.listingId,
      host_profile_id:            params.hostProfileId,
      tier:                       params.tier ?? "starter",
      surfaces:                   ["homepage"],
      status:                     "active",
      starts_at:                  now.toISOString(),
      ends_at:                    endsAt.toISOString(),
      stripe_checkout_session_id: params.sessionId,
      stripe_payment_intent_id:   params.paymentIntentId,
      purchase_amount_cents:      params.amountCents,
      purchase_duration_days:     params.durationDays,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`activateBoostCampaignFromCheckout (insert): ${error.message}`);
  }

  return { id: (data as { id: string }).id, alreadyExisted: false };
}
