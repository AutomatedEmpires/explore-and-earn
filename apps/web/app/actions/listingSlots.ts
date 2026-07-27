"use server";

import { auth } from "@clerk/nextjs/server";

import { ADDITIONAL_LISTING_MAX_PER_CHECKOUT } from "@explore-and-earn/contracts";
import { getHostTierAndProfile } from "@explore-and-earn/db";

import { getClerkContact } from "../../lib/clerkUser";
import { checkRateLimitDistributed } from "../../lib/rateLimit";
import {
  createAdditionalListingCheckoutSession,
  hasStripeServerConfig,
  isAdditionalListingTier,
} from "../../services/stripe";

export type AdditionalListingCheckoutResult =
  | { ok: true; sessionUrl: string }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "not_host"
        | "no_subscription"
        | "invalid_quantity"
        | "no_stripe_config"
        | "rate_limited"
        | "checkout_failed";
    };

/**
 * Start a Stripe Checkout for the additional-listing add-on (founder decision
 * 2026-07-26: "additional listings need to be an add on. price based on tier").
 *
 * The PRICE is resolved from the host's real stored tier on the server — the
 * client sends only how many slots it wants. Nothing is credited here: the
 * allowance lands in the webhook (syncAdditionalListingPurchase), idempotent on
 * the checkout session id, mirroring the boost and invite-pack flows.
 *
 * AN UNSUBSCRIBED HOST IS REFUSED. The add-on is priced "based on tier" and
 * sells a listing "beyond your plan's included count"; there is no free tier, so
 * a host with no plan has no rate and no included count to go beyond. Selling it
 * to them at the Starter rate would be the Starter allowance without the Starter
 * subscription.
 */
export async function createAdditionalListingCheckoutAction(
  quantity: number,
): Promise<AdditionalListingCheckoutResult> {
  if (
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > ADDITIONAL_LISTING_MAX_PER_CHECKOUT
  ) {
    return { ok: false, reason: "invalid_quantity" };
  }

  if (!hasStripeServerConfig()) {
    return { ok: false, reason: "no_stripe_config" };
  }

  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, reason: "unauthenticated" };
  const token = await getToken();
  if (!token) return { ok: false, reason: "unauthenticated" };

  // Same budget as every other checkout entry point: 10 sessions per hour per
  // host. Each call mints a real Stripe Checkout session.
  const { allowed } = await checkRateLimitDistributed(
    `listing-slot-checkout:${userId}`,
    10,
    60 * 60 * 1000,
  );
  if (!allowed) return { ok: false, reason: "rate_limited" };

  const host = await getHostTierAndProfile(token, userId);
  if (!host) return { ok: false, reason: "not_host" };

  // "none" — and anything else this layer cannot read as a paid tier — has no
  // add-on rate, so there is nothing to charge and no session to open.
  if (!isAdditionalListingTier(host.subscriptionTier)) {
    return { ok: false, reason: "no_subscription" };
  }
  const tier = host.subscriptionTier;

  try {
    // The email is how the add-on checkout reaches the host's EXISTING Stripe
    // customer when the clerkUserId metadata search misses. Without a customer
    // the session mints an orphan one, and the billing portal — which resolves
    // by that metadata — would never show the add-on subscription the host is
    // being charged for.
    const contact = await getClerkContact(userId).catch(() => ({
      email: null,
      name: null,
    }));
    const checkout = await createAdditionalListingCheckoutSession({
      clerkUserId: userId,
      hostProfileId: host.hostProfileId,
      hostSubscriptionTier: tier,
      quantity,
      customerEmail: contact.email,
    });
    const url = checkout.url;
    if (!url) return { ok: false, reason: "checkout_failed" };
    return { ok: true, sessionUrl: url };
  } catch {
    return { ok: false, reason: "checkout_failed" };
  }
}
