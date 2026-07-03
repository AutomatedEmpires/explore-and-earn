"use server";

import { auth } from "@clerk/nextjs/server";

import {
  BOOST_DURATIONS,
  BOOST_PRICING,
  type BoostDuration,
} from "@explore-and-earn/contracts";
import {
  getHostTierAndProfile,
  getOwnedListingForBoost,
} from "@explore-and-earn/db";

import {
  createBoostCheckoutSession,
  hasStripeServerConfig,
} from "../../services/stripe";

// Re-export the launch boost pricing so the client popup imports tiers from the
// action module (mirrors HostAnnouncementComposer importing ANNOUNCEMENT_PRICING
// through the community action).
export { BOOST_DURATIONS, BOOST_PRICING };

export type BoostCheckoutResult =
  | { ok: true; sessionUrl: string }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "not_host"
        | "not_owner"
        | "not_live"
        | "invalid_duration"
        | "no_stripe_config"
        | "checkout_failed";
    };

const BOOST_DURATION_SET = new Set<number>(BOOST_DURATIONS);

async function resolveAuth() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken({ template: "supabase" });
  if (!token) return null;
  return { userId, token };
}

/**
 * Starts a Stripe Checkout (mode: payment) for boosting a listing. Verifies the
 * caller owns the listing and that it is live, prices the tier from the founder-
 * locked BOOST_PRICING contract, and returns the hosted Checkout URL. The boost
 * campaign row is NOT written here — it is created by the Stripe webhook on
 * checkout.session.completed (see services/stripe syncBoostPurchase), mirroring
 * the announcement purchase flow.
 */
export async function createBoostCheckoutAction(
  listingId: string,
  durationDays: BoostDuration,
): Promise<BoostCheckoutResult> {
  if (!listingId || !BOOST_DURATION_SET.has(durationDays)) {
    return { ok: false, reason: "invalid_duration" };
  }

  if (!hasStripeServerConfig()) {
    return { ok: false, reason: "no_stripe_config" };
  }

  const session = await resolveAuth();
  if (!session) return { ok: false, reason: "unauthenticated" };

  const host = await getHostTierAndProfile(session.token, session.userId);
  if (!host) return { ok: false, reason: "not_host" };

  // IDOR guard: the listing must belong to THIS host (RLS-scoped read).
  const listing = await getOwnedListingForBoost({
    token: session.token,
    listingId,
    hostProfileId: host.hostProfileId,
  });
  if (!listing) return { ok: false, reason: "not_owner" };
  if (listing.status !== "live") return { ok: false, reason: "not_live" };

  try {
    const checkout = await createBoostCheckoutSession({
      clerkUserId: session.userId,
      hostProfileId: host.hostProfileId,
      listingId,
      durationDays,
      hostSubscriptionTier: host.subscriptionTier,
    });
    const url = checkout.url;
    if (!url) return { ok: false, reason: "checkout_failed" };
    return { ok: true, sessionUrl: url };
  } catch {
    return { ok: false, reason: "checkout_failed" };
  }
}
