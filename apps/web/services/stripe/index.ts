import "server-only";

import Stripe from "stripe";
import {
  adminClient,
  activateBoostCampaignFromCheckout,
  closeHostListingsOverAllowance,
  creditListingSlotPurchase,
  getHostSubscriptionByClerkUserId,
  insertHostAnnouncement,
  recordInvitePackPurchase,
  revokeListingSlotPurchase,
  syncListingSlotSubscription,
  upsertHostSubscription,
  type BoostPurchaseTier,
  type HostBillingStatusValue,
} from "@explore-and-earn/db";
import {
  ADDITIONAL_LISTING_MAX_PER_CHECKOUT,
  ADDITIONAL_LISTING_PRICING,
  ANNOUNCEMENT_PRICE_CENTS,
  ANNOUNCEMENT_RUN_DAYS,
  BOOST_DURATIONS,
  BOOST_PRICING,
  FOUNDER_LOCKED_PRICING,
  INVITE_CREDIT_PACKS,
  type BoostDuration,
} from "@explore-and-earn/contracts";
import {
  refundableCents,
  refundedCents,
  selectLatestSubscriptionCharge,
  type SubscriptionCharge,
} from "./refundVerification";

const APP_INFO = {
  name: "Explore & Earn",
  version: "0.1.0",
  url: "https://exploreandearn.com",
} as const;

const STRIPE_PRICE_ENV = {
  starter: {
    monthly: "STRIPE_PRICE_STARTER_MONTHLY",
    yearly: "STRIPE_PRICE_STARTER_YEARLY",
  },
  professional: {
    monthly: "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
    yearly: "STRIPE_PRICE_PROFESSIONAL_YEARLY",
  },
  enterprise: {
    monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    yearly: "STRIPE_PRICE_ENTERPRISE_YEARLY",
  },
} as const;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);

let cachedStripeClient: Stripe | null = null;

export type HostSubscriptionTier = keyof typeof FOUNDER_LOCKED_PRICING;
export type StoredSubscriptionTier = HostSubscriptionTier | "none";
export type BillingInterval = "monthly" | "yearly";

const HOST_SUBSCRIPTION_TIERS = Object.keys(
  FOUNDER_LOCKED_PRICING,
) as HostSubscriptionTier[];
const BILLING_INTERVALS = ["monthly", "yearly"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} for Stripe server configuration.`);
  }

  return value;
}

function searchQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === "string" && value.length > 0) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function billingMetadata(
  clerkUserId: string,
  subscriptionTier: HostSubscriptionTier,
): Record<string, string> {
  return {
    clerkUserId,
    subscriptionTier,
  };
}

function maybeResolveStripePriceId(
  tier: HostSubscriptionTier,
  interval: BillingInterval,
): string | null {
  return process.env[STRIPE_PRICE_ENV[tier][interval]] ?? null;
}

function resolveStripePriceId(
  tier: HostSubscriptionTier,
  interval: BillingInterval,
): string {
  return requireEnv(STRIPE_PRICE_ENV[tier][interval]);
}

function resolveTierFromPriceId(
  priceId: string,
): { tier: HostSubscriptionTier; interval: BillingInterval } | null {
  for (const tier of HOST_SUBSCRIPTION_TIERS) {
    for (const interval of BILLING_INTERVALS) {
      if (maybeResolveStripePriceId(tier, interval) === priceId) {
        return { tier, interval };
      }
    }
  }

  return null;
}

async function findStripeCustomer(params: {
  clerkUserId: string;
  customerEmail: string | null;
}): Promise<Stripe.Customer | null> {
  const stripe = getStripeClient();
  const { clerkUserId, customerEmail } = params;

  try {
    const byMetadata = await stripe.customers.search({
      query: `metadata['clerkUserId']:'${searchQueryValue(clerkUserId)}'`,
      limit: 1,
    });
    const first = byMetadata.data[0];
    if (first) return first;
  } catch (error) {
    console.warn("[stripe] customer metadata search failed", error);
  }

  if (!customerEmail) {
    return null;
  }

  const byEmail = await stripe.customers.list({
    email: customerEmail,
    limit: 1,
  });

  return byEmail.data[0] ?? null;
}

async function ensureCustomerMetadata(
  customerId: string,
  metadata: Record<string, string>,
): Promise<void> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    return;
  }

  const mergedMetadata = {
    ...normalizeMetadata(customer.metadata),
    ...metadata,
  };

  const currentMetadata = normalizeMetadata(customer.metadata);
  const changed = Object.keys(mergedMetadata).some(
    (key) => currentMetadata[key] !== mergedMetadata[key],
  );

  if (!changed) {
    return;
  }

  await stripe.customers.update(customerId, { metadata: mergedMetadata });
}

async function resolveCustomerClerkUserId(customerId: string): Promise<string | null> {
  const stripe = getStripeClient();
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    return null;
  }

  const clerkUserId = customer.metadata.clerkUserId;
  return typeof clerkUserId === "string" && clerkUserId.length > 0
    ? clerkUserId
    : null;
}

/**
 * Record a subscription state change in BOTH places, authority first.
 *
 * public.host_subscriptions (migration 083) is keyed by Clerk user id and is
 * what create_my_host_profile reads, so it must be written even when the
 * customer has no host profile yet — which is now the normal order of events:
 * sign up, choose a tier, pay, then create the profile. The host_profiles UPDATE
 * that used to be the whole of this function matched zero rows in exactly that
 * case, so the payment landed and nothing recorded it. upsertHostSubscription
 * throws on failure, so that write is the one this function guarantees.
 *
 * host_profiles.subscription_tier remains the denormalized copy that listing,
 * search and badge queries join, so it is still kept in step. The `.select("id")`
 * is load-bearing: Supabase answers a zero-row UPDATE with
 * `{ data: [], error: null }`, so checking `error` alone cannot tell "wrote the
 * tier" apart from "matched nothing".
 *
 * WHAT A ZERO-ROW MATCH MEANS DEPENDS ON WHETHER A PROFILE EXISTS — not on the
 * direction, which is what this used to test.
 *
 * Raising on a zero-row GRANT was right for the case it was written for (a
 * paying host whose profile exists and whose read copy silently stayed stale)
 * and became fatal for the ordinary one the moment 083 landed. That gate makes a
 * host_profiles row IMPOSSIBLE at payment time, so every new customer took the
 * raise: a 500 on the first webhook of every subscription, a Sentry page each
 * time, and sustained 5xx is the documented way Stripe disables an endpoint —
 * which would then silently break every grant AND every revocation.
 *
 * So the question the code asks is the one that separates the two: is there a
 * host_profiles row this UPDATE should have hit?
 *
 *   * NO ROW — the normal, expected state. Nothing is lost: upsertHostSubscription
 *     above has already recorded the entitlement in the authority, and
 *     create_my_host_profile (083) seeds the copy from that authority when the
 *     profile is created, and re-seeds it on every later call. Resolve, 2xx.
 *   * A ROW EXISTS and the UPDATE still changed nothing — a real failure, in
 *     either direction. The copy is now out of step with the authority and no
 *     later step repairs it. Throw, non-2xx, Stripe redelivers.
 */
async function syncHostSubscriptionTier(
  clerkUserId: string,
  subscriptionTier: StoredSubscriptionTier,
  details?: {
    billingStatus?: HostBillingStatusValue;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    currentPeriodEnd?: string | null;
  },
): Promise<void> {
  await upsertHostSubscription({
    clerkUserId,
    tier: subscriptionTier,
    billingStatus: details?.billingStatus,
    stripeCustomerId: details?.stripeCustomerId ?? null,
    stripeSubscriptionId: details?.stripeSubscriptionId ?? null,
    currentPeriodEnd: details?.currentPeriodEnd ?? null,
  });

  const db = adminClient();
  const { data, error } = await db
    .from("host_profiles")
    .update({ subscription_tier: subscriptionTier })
    .eq("clerk_user_id", clerkUserId)
    .select("id");

  if (error) {
    throw new Error(`Failed to sync host subscription tier: ${error.message}`);
  }

  // The PLAN term of this host's allowance has just moved. Bring their live
  // inventory back inside it, because nothing else will: 083's trigger fires on
  // a write to `listings`, and a host whose plan lapsed writes nothing — their
  // listings stayed public on a plan that stopped paying for them. On a GRANT
  // this is a no-op, since a host inside their allowance has no excess to close.
  //
  // The ADD-ON term is not swept from here and must not be: this function is
  // never reached on the add-on branch of syncSubscriptionEvent. It is swept
  // inside 085's credit / revoke / sync functions, the only writers of
  // host_profiles.purchased_listing_slots.
  //
  // It runs before the zero-row resolution below on purpose: that path can
  // throw, and a sweep skipped by an early throw is a sweep that never happens.
  await closeHostListingsOverAllowance(clerkUserId);

  if (!data || data.length === 0) {
    await requireNoHostProfileToUpdate(clerkUserId);
  }
}

/**
 * Resolve a zero-row host_profiles UPDATE into the two facts it conflates.
 *
 * The probe carries the SAME predicate as the UPDATE, so "a row exists" cannot
 * quietly mean "a row exists that the UPDATE was never going to match" — a
 * deleted_at filter here, for instance, would report an absent profile for a
 * soft-deleted one the UPDATE did try to write.
 *
 * A read fault is not evidence of either fact, so it throws rather than being
 * flattened into "no profile": guessing in that direction is what turns a
 * transient database error into a permanently stale entitlement.
 */
async function requireNoHostProfileToUpdate(clerkUserId: string): Promise<void> {
  const db = adminClient();
  const { data, error } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to sync host subscription tier: the host profile could not be read back: ${error.message}`,
    );
  }

  if (data && data.length > 0) {
    // The Clerk id is deliberately NOT in the message — this string reaches
    // logs and Sentry, and the event id there is enough to trace the host.
    // The word "paying" is likewise absent: this same function runs on
    // revocations, and a message that assumed a payer would be a lie half the
    // time it could ever be printed.
    throw new Error(
      "Failed to sync host subscription tier: a host_profiles row exists but the tier update changed nothing.",
    );
  }
}

/** Map a Stripe subscription status onto the stored billing_status vocabulary. */
function toBillingStatus(status: Stripe.Subscription.Status): HostBillingStatusValue {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "unpaid":
      return "unpaid";
    case "paused":
      return "paused";
    default:
      // incomplete / incomplete_expired: nothing is paying, and 'none' is the
      // vocabulary's word for that.
      return "none";
  }
}

function resolveSubscriptionTier(
  subscription: Stripe.Subscription,
): StoredSubscriptionTier | null {
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return "none";
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    return null;
  }

  return resolveTierFromPriceId(priceId)?.tier ?? null;
}

async function syncAnnouncementPurchase(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  const clerkUserId = session.metadata?.clerkUserId ?? null;
  const hostProfileId = session.metadata?.hostProfileId ?? null;

  if (!clerkUserId || !hostProfileId) {
    return { action: "ignored_missing_announcement_metadata", clerkUserId, tier: null };
  }

  // Flat 7-day run — no duration options (founder directive 2026-06-21).
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ANNOUNCEMENT_RUN_DAYS);

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  await insertHostAnnouncement({
    hostProfileId,
    title:                    "",
    body:                     "",
    kind:                     "general",
    expiresAt:                expiresAt.toISOString(),
    status:                   "draft",
    stripePaymentIntentId:    paymentIntentId,
    // Idempotency key: a retried checkout.session.completed must not create a
    // second paid draft (migration 049 + insertHostAnnouncement dedupe).
    stripeCheckoutSessionId:  session.id,
    purchaseDurationDays:     ANNOUNCEMENT_RUN_DAYS,
    purchaseAmountCents:      ANNOUNCEMENT_PRICE_CENTS,
  });

  return { action: "created_announcement_draft", clerkUserId, tier: null };
}

// Normalizes an arbitrary host subscription-tier string (including "none",
// for a host with no active subscription, or a missing/stale metadata value
// on a webhook retry from before this field existed) into a valid
// listing_boost_campaigns.tier value. "none"/"starter" both land on
// "starter" — the lowest real paid tier — rather than erroring, since a host
// without a professional/enterprise subscription still gets the same
// exposure-only boost, just without the higher ranking priority.
function toBoostPurchaseTier(subscriptionTier: string): BoostPurchaseTier {
  return subscriptionTier === "professional" || subscriptionTier === "enterprise"
    ? subscriptionTier
    : "starter";
}

async function syncBoostPurchase(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  const clerkUserId = session.metadata?.clerkUserId ?? null;
  const hostProfileId = session.metadata?.hostProfileId ?? null;
  const listingId = session.metadata?.listingId ?? null;
  const durationRaw = session.metadata?.durationDays;
  const durationDays = durationRaw ? parseInt(durationRaw, 10) : null;
  const boostTier = toBoostPurchaseTier(session.metadata?.tier ?? "starter");

  if (!hostProfileId || !listingId || !durationDays) {
    return { action: "ignored_missing_boost_metadata", clerkUserId, tier: null };
  }

  if (!BOOST_DURATIONS.includes(durationDays as BoostDuration)) {
    return { action: "ignored_invalid_boost_duration", clerkUserId, tier: null };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  // amount_total is authoritative (what the customer actually paid); fall back
  // to the founder-locked contract price if Stripe omits it.
  const amountCents =
    typeof session.amount_total === "number"
      ? session.amount_total
      : BOOST_PRICING[durationDays as BoostDuration];

  const result = await activateBoostCampaignFromCheckout({
    sessionId:       session.id,
    paymentIntentId,
    listingId,
    hostProfileId,
    durationDays,
    amountCents,
    tier:            boostTier,
  });

  return {
    action: result.alreadyExisted
      ? "boost_campaign_already_active"
      : "activated_boost_campaign",
    clerkUserId,
    tier: null,
  };
}

/**
 * Land a paid invite-credit pack as a ledger 'purchase' row (migration 061).
 * Idempotent on the checkout session id — Stripe's at-least-once delivery can
 * never double-credit (mirrors the 046/049 idempotency discipline).
 */
async function syncInviteCreditPurchase(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  const clerkUserId = session.metadata?.clerkUserId ?? null;
  const hostProfileId = session.metadata?.hostProfileId ?? null;
  const creditsRaw = session.metadata?.credits;
  const credits = creditsRaw ? parseInt(creditsRaw, 10) : null;

  if (!clerkUserId || !hostProfileId || !credits) {
    return { action: "ignored_missing_invite_pack_metadata", clerkUserId, tier: null };
  }

  // Only founder-locked pack sizes are creditable (ADR-028).
  if (!INVITE_CREDIT_PACKS.some((pack) => pack.credits === credits)) {
    return { action: "ignored_invalid_invite_pack_size", clerkUserId, tier: null };
  }

  const result = await recordInvitePackPurchase({
    hostProfileId,
    credits,
    stripeCheckoutSessionId: session.id,
  });

  if (!result.ok) {
    // Surface as a retryable failure — the ledger insert faulted (e.g. 061 not
    // applied yet). Stripe will redeliver.
    throw new Error("invite pack purchase could not be recorded");
  }

  return {
    action: result.alreadyRecorded
      ? "invite_pack_already_credited"
      : "credited_invite_pack",
    clerkUserId,
    tier: null,
  };
}

/**
 * Land a paid additional-listing add-on as purchased allowance (migration 085).
 *
 * Idempotent on the checkout session id inside credit_listing_slot_purchase, so
 * Stripe's at-least-once delivery can never credit the same payment twice.
 * A failure to record THROWS, so the webhook route returns non-2xx and Stripe
 * redelivers — silently swallowing it would take the money and grant nothing.
 */
async function syncAdditionalListingPurchase(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  const clerkUserId = session.metadata?.clerkUserId ?? null;
  const hostProfileId = session.metadata?.hostProfileId ?? null;
  const quantityRaw = session.metadata?.quantity;
  const quantity = quantityRaw ? parseInt(quantityRaw, 10) : null;
  const tier = session.metadata?.tier ?? "none";

  if (!hostProfileId || !quantity || !Number.isInteger(quantity)) {
    return { action: "ignored_missing_listing_slot_metadata", clerkUserId, tier: null };
  }
  if (quantity <= 0 || quantity > ADDITIONAL_LISTING_MAX_PER_CHECKOUT) {
    return { action: "ignored_invalid_listing_slot_quantity", clerkUserId, tier: null };
  }

  // The contract price is authoritative for the RECORD (what one slot costs at
  // this tier). session.amount_total is the whole line, quantity included, so
  // dividing it would re-derive a per-unit figure that a coupon could distort.
  //
  // The tier can only fail to resolve if our own metadata is corrupt — the
  // checkout refuses to open for anything but a paid tier. There is no
  // "unsubscribed rate" to fall back to any more, so fall back to the figure we
  // QUOTED into the session's metadata rather than inventing one, and to 0 if
  // even that is unreadable. The purchase is still credited: the money arrived.
  const quotedAmountCents = Number.parseInt(session.metadata?.amountCents ?? "", 10);
  const unitAmountCents = isAdditionalListingTier(tier)
    ? ADDITIONAL_LISTING_PRICING[tier]
    : Number.isInteger(quotedAmountCents) && quotedAmountCents >= 0
      ? quotedAmountCents
      : 0;

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  const result = await creditListingSlotPurchase({
    hostProfileId,
    quantity,
    unitAmountCents,
    tier,
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: subscriptionId,
  });

  if (!result.ok) {
    throw new Error("additional listing purchase could not be recorded");
  }

  return {
    action: result.alreadyCredited
      ? "listing_slots_already_credited"
      : "credited_listing_slots",
    clerkUserId,
    tier: null,
  };
}

/**
 * Has Stripe actually collected the money for this session?
 *
 * `checkout.session.completed` does NOT mean paid. Delayed-notification methods
 * (ACH/SEPA debit, bank transfers, some wallets, and "buy now pay later") fire
 * completed with payment_status 'unpaid' and only settle later via
 * checkout.session.async_payment_succeeded — or fail via
 * async_payment_failed. Granting on `completed` alone therefore hands out a
 * paid tier, a boost campaign, a paid announcement or invite credits for money
 * that may never arrive.
 *
 * 'no_payment_required' is a legitimate paid state (a 100% coupon or a zero-
 * amount trial), so it is honoured.
 */
export function checkoutIsPaid(session: Stripe.Checkout.Session): boolean {
  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  );
}

async function syncCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  // Nothing is granted until the money is real. The matching
  // async_payment_succeeded event re-enters this same function once it is.
  if (!checkoutIsPaid(session)) {
    return {
      action: "deferred_unpaid_checkout",
      clerkUserId:
        typeof session.metadata?.clerkUserId === "string"
          ? session.metadata.clerkUserId
          : null,
      tier: null,
    };
  }

  if (session.metadata?.productType === "announcement") {
    return syncAnnouncementPurchase(session);
  }

  if (session.metadata?.productType === "listing_boost") {
    return syncBoostPurchase(session);
  }

  if (session.metadata?.productType === "invite_credits") {
    return syncInviteCreditPurchase(session);
  }

  // Must precede the mode check below: the additional-listing add-on is a
  // RECURRING product, so its session.mode is "subscription" — falling through
  // would treat it as a host plan and rewrite subscription_tier.
  if (session.metadata?.productType === ADDITIONAL_LISTING_PRODUCT_TYPE) {
    return syncAdditionalListingPurchase(session);
  }

  if (session.mode !== "subscription") {
    return {
      action: "ignored_non_subscription_checkout",
      clerkUserId: null,
      tier: null,
    };
  }

  const clerkUserIdFromMetadata = session.metadata?.clerkUserId;
  const clerkUserId =
    typeof clerkUserIdFromMetadata === "string" && clerkUserIdFromMetadata.length > 0
      ? clerkUserIdFromMetadata
      : typeof session.client_reference_id === "string" &&
          session.client_reference_id.length > 0
        ? session.client_reference_id
        : null;

  const subscriptionTierRaw = session.metadata?.subscriptionTier;
  const subscriptionTier =
    typeof subscriptionTierRaw === "string" && isHostSubscriptionTier(subscriptionTierRaw)
      ? subscriptionTierRaw
      : null;

  if (typeof session.customer === "string" && clerkUserId && subscriptionTier) {
    await ensureCustomerMetadata(
      session.customer,
      billingMetadata(clerkUserId, subscriptionTier),
    );
  }

  if (!clerkUserId || !subscriptionTier) {
    return {
      action: "ignored_missing_checkout_metadata",
      clerkUserId,
      tier: subscriptionTier,
    };
  }

  await syncHostSubscriptionTier(clerkUserId, subscriptionTier, {
    billingStatus: "active",
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : null,
    stripeSubscriptionId:
      typeof session.subscription === "string" ? session.subscription : null,
  });

  return {
    action: "synced_checkout_session",
    clerkUserId,
    tier: subscriptionTier,
  };
}

async function syncSubscriptionEvent(
  subscription: Stripe.Subscription,
  deleted: boolean,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  // ── The add-on branch, FIRST ────────────────────────────────────────────────
  // A host who buys the additional-listing add-on holds TWO Stripe
  // subscriptions. `deleted` below hard-codes tier "none" without consulting the
  // price, so cancelling the ADD-ON would silently downgrade a paying host's
  // plan to unsubscribed. The add-on carries its own productType in
  // subscription metadata; it never touches subscription_tier.
  if (subscription.metadata?.productType === ADDITIONAL_LISTING_PRODUCT_TYPE) {
    if (!deleted) {
      // NOT a no-op. Crediting happens once, from checkout.session.completed —
      // so without this branch the allowance never moves again, and two things
      // slip through: a subscription parked in a NON-PAYING status (Stripe
      // leaves an uncollected subscription in 'unpaid' / 'incomplete_expired' /
      // 'paused' and may never emit deleted), and a QUANTITY CHANGED in the
      // billing portal, which only ever surfaces here. Either way the host
      // holds listing slots they are not paying for.
      //
      // The sync is a delta against what this purchase currently contributes,
      // so a redelivered event changes nothing.
      // Same verdict the PLAN path uses (resolveSubscriptionTier reads this
      // exact set): active / trialing / past_due are still paying, everything
      // else is not. One definition, so a plan and its add-on can never
      // disagree about whether a host is in good standing.
      const entitled = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
      const synced = await syncListingSlotSubscription({
        stripeSubscriptionId: subscription.id,
        quantity: additionalListingQuantity(subscription),
        entitled,
      });
      if (!synced.ok) {
        throw new Error("additional listing allowance could not be synced");
      }
      return {
        action: !synced.found
          ? "listing_slots_purchase_not_found"
          : !synced.changed
            ? "listing_slots_unchanged"
            : entitled
              ? "synced_listing_slots"
              : "revoked_listing_slots_unpaid",
        clerkUserId: subscription.metadata?.clerkUserId ?? null,
        tier: null,
      };
    }
    const revoked = await revokeListingSlotPurchase(subscription.id);
    if (!revoked.ok) {
      throw new Error("additional listing allowance could not be revoked");
    }
    return {
      action: revoked.found
        ? revoked.alreadyRevoked
          ? "listing_slots_already_revoked"
          : "revoked_listing_slots"
        : "listing_slots_purchase_not_found",
      clerkUserId: subscription.metadata?.clerkUserId ?? null,
      tier: null,
    };
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  const metadataClerkUserId = subscription.metadata.clerkUserId;
  const clerkUserId =
    typeof metadataClerkUserId === "string" && metadataClerkUserId.length > 0
      ? metadataClerkUserId
      : customerId
        ? await resolveCustomerClerkUserId(customerId)
        : null;

  if (!clerkUserId) {
    return {
      action: "ignored_missing_clerk_user",
      clerkUserId: null,
      tier: null,
    };
  }

  const tier = deleted ? "none" : resolveSubscriptionTier(subscription);

  if (!tier) {
    return {
      action: "ignored_unmapped_subscription_price",
      clerkUserId,
      tier: null,
    };
  }

  // A REVOCATION must name the subscription the database is actually entitled
  // by. Stripe sends customer.subscription.deleted for whichever subscription
  // ended, and this function used to act on it without ever asking which
  // subscription the recorded entitlement came from — so a cancellation could
  // take away an entitlement granted by a DIFFERENT, still-billing subscription.
  // A host with two concurrent subscriptions is not hypothetical: the
  // already-subscribed guard on checkout used to fail open, and the upsert here
  // overwrites stripe_subscription_id, so the older one billed on with nothing
  // pointing at it. Cancelling the older one would then have revoked the newer
  // one's plan.
  //
  // A recorded id that does not match is proof this event is about something
  // else. No recorded id at all is not proof of anything — that is a row written
  // before the id was captured — so it still revokes. The read THROWS on
  // failure, which is the right direction here: an unreadable authority must not
  // become a revocation.
  //
  // Only revocations are checked. A GRANT from an unrecognised subscription id
  // is exactly what re-subscribing looks like — new subscription, old id still
  // on the row — and refusing it would leave a paying host unentitled.
  if (tier === "none") {
    const recorded = await getHostSubscriptionByClerkUserId(clerkUserId);
    if (
      recorded?.stripeSubscriptionId &&
      recorded.stripeSubscriptionId !== subscription.id
    ) {
      return {
        action: "ignored_stale_subscription_revocation",
        clerkUserId,
        tier: null,
      };
    }
  }

  if (customerId && tier !== "none") {
    await ensureCustomerMetadata(customerId, billingMetadata(clerkUserId, tier));
  }

  await syncHostSubscriptionTier(clerkUserId, tier, {
    billingStatus: deleted ? "cancelled" : toBillingStatus(subscription.status),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  return {
    action: deleted ? "synced_subscription_deleted" : "synced_subscription_state",
    clerkUserId,
    tier,
  };
}

export function isHostSubscriptionTier(value: string): value is HostSubscriptionTier {
  return HOST_SUBSCRIPTION_TIERS.includes(value as HostSubscriptionTier);
}

export function isBillingInterval(value: string): value is BillingInterval {
  return BILLING_INTERVALS.includes(value as BillingInterval);
}

export function hasStripeServerConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function hasStripeCheckoutConfig(): boolean {
  if (!hasStripeServerConfig()) {
    return false;
  }

  return HOST_SUBSCRIPTION_TIERS.every((tier) =>
    BILLING_INTERVALS.every(
      (interval) => maybeResolveStripePriceId(tier, interval) !== null,
    ),
  );
}

export function getStripeClient(): Stripe {
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      // Pin the API version so a Stripe-side default bump can't silently change
      // webhook/response shapes. Matches the version this SDK (22.x) is built
      // against; review on SDK upgrades.
      apiVersion: "2026-05-27.dahlia",
      appInfo: APP_INFO,
    });
  }

  return cachedStripeClient;
}

export async function createCheckoutSession(params: {
  clerkUserId: string;
  customerEmail: string | null;
  customerName: string | null;
  companyName: string;
  subscriptionTier: HostSubscriptionTier;
  billingInterval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const customer = await findStripeCustomer({
    clerkUserId: params.clerkUserId,
    customerEmail: params.customerEmail,
  });
  const metadata = billingMetadata(params.clerkUserId, params.subscriptionTier);

  if (customer) {
    await ensureCustomerMetadata(customer.id, metadata);
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: params.clerkUserId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    metadata,
    line_items: [
      {
        price: resolveStripePriceId(
          params.subscriptionTier,
          params.billingInterval,
        ),
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata,
    },
    customer: customer?.id,
    customer_email: customer ? undefined : params.customerEmail ?? undefined,
    ...(customer
      ? {}
      : {
          customer_creation: "always" as const,
          customer_update: {
            address: "auto" as const,
            name: "auto" as const,
          },
        }),
    custom_text: {
      submit: {
        message: params.companyName,
      },
    },
  });
}

function absoluteAppUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "https://exploreandearn.com";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Flat, single 7-day placement — no duration options (founder directive
// 2026-06-21), so there is exactly one Stripe Price env var to resolve.
export async function createAnnouncementCheckoutSession(params: {
  clerkUserId: string;
  hostProfileId: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const priceId = requireEnv("STRIPE_PRICE_ANNOUNCEMENT");

  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.clerkUserId,
    success_url: absoluteAppUrl("/community?tab=announcements&purchased=1"),
    cancel_url:  absoluteAppUrl("/community?tab=announcements"),
    metadata: {
      productType:   "announcement",
      hostProfileId: params.hostProfileId,
      clerkUserId:   params.clerkUserId,
    },
    line_items: [{ price: priceId, quantity: 1 }],
  });
}

// ─── Listing boost checkout ───────────────────────────────────────────────────
// Optional pre-created Stripe Price ids per duration. When unset we fall back to
// an inline price_data line item priced from the founder-locked BOOST_PRICING
// contract (integer cents). Either path works; env price ids let Finance manage
// the catalog in Stripe without a code change.
const BOOST_PRICE_ENV: Record<BoostDuration, string> = {
  7:  "STRIPE_PRICE_BOOST_7D",
  14: "STRIPE_PRICE_BOOST_14D",
  28: "STRIPE_PRICE_BOOST_28D",
};

const BOOST_DURATION_LABEL: Record<BoostDuration, string> = {
  7:  "7-day listing boost",
  14: "14-day listing boost",
  28: "28-day listing boost",
};

export async function createBoostCheckoutSession(params: {
  clerkUserId: string;
  hostProfileId: string;
  listingId: string;
  durationDays: BoostDuration;
  /** The host's subscription tier at purchase time — carried through to the
   * webhook so the resulting campaign is ranked at the buyer's actual plan,
   * not silently downgraded to the activateBoostCampaignFromCheckout default. */
  hostSubscriptionTier: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const envPriceId = process.env[BOOST_PRICE_ENV[params.durationDays]];
  const amountCents = BOOST_PRICING[params.durationDays];
  const tier = toBoostPurchaseTier(params.hostSubscriptionTier);

  // Boost provenance is carried on session.metadata; the webhook reads it to
  // write the listing_boost_campaigns row. productType keys the webhook branch,
  // matching the announcement flow's metadata shape.
  const metadata = {
    productType:   "listing_boost",
    kind:          "listing_boost",
    listingId:     params.listingId,
    hostProfileId: params.hostProfileId,
    clerkUserId:   params.clerkUserId,
    durationDays:  String(params.durationDays),
    amountCents:   String(amountCents),
    tier,
  } as const;

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = envPriceId
    ? { price: envPriceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: BOOST_DURATION_LABEL[params.durationDays] },
        },
      };

  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.clerkUserId,
    success_url: absoluteAppUrl("/host/listings?boosted=1"),
    cancel_url:  absoluteAppUrl("/host/listings"),
    metadata,
    line_items: [lineItem],
  });
}

// ─── Additional-listing add-on checkout ───────────────────────────────────────
// Founder decision 2026-07-26: "additional listings need to be an add on. price
// based on tier." The three prices are founder-locked in
// ADDON_PRICING.additionalListingMonthly and surfaced through
// ADDITIONAL_LISTING_PRICING — this module never states a price of its own.
//
// The add-on is MONTHLY, so this is a `subscription`-mode Checkout and the host
// ends up with a second Stripe subscription alongside their plan. That is
// deliberate and is why both webhook paths branch on productType before doing
// anything tier-related.

/** Webhook + metadata key for the add-on. One constant, three call sites. */
export const ADDITIONAL_LISTING_PRODUCT_TYPE = "additional_listing";

/**
 * The tiers the add-on can be sold to — the PAID ones, and only those.
 *
 * ADDITIONAL_LISTING_PRICING deliberately has no 'none' key: an extra listing
 * "beyond your plan's included count" presupposes a plan, and quoting an
 * unsubscribed host the Starter rate (while the cap floored 'none' at Starter's
 * included listing) sold the Starter allowance without the Starter
 * subscription. isAdditionalListingTier is therefore FALSE for "none", which is
 * what stops the checkout being created at all.
 */
export type AdditionalListingTier = keyof typeof ADDITIONAL_LISTING_PRICING;

export function isAdditionalListingTier(value: string): value is AdditionalListingTier {
  return Object.prototype.hasOwnProperty.call(ADDITIONAL_LISTING_PRICING, value);
}

/** Optional pre-created Stripe Price ids per tier. Unset falls back to inline
 * price_data from the founder-locked contract, exactly as boost does. */
const ADDITIONAL_LISTING_PRICE_ENV: Record<AdditionalListingTier, string> = {
  starter: "STRIPE_PRICE_ADDITIONAL_LISTING_STARTER",
  professional: "STRIPE_PRICE_ADDITIONAL_LISTING_PROFESSIONAL",
  enterprise: "STRIPE_PRICE_ADDITIONAL_LISTING_ENTERPRISE",
};

/**
 * The add-on subscription's current line quantity, or null when Stripe did not
 * send one. Null means "leave the recorded quantity alone" — inventing a
 * quantity from an incomplete payload would rewrite an allowance nobody
 * changed.
 */
function additionalListingQuantity(
  subscription: Stripe.Subscription,
): number | null {
  const quantity = subscription.items?.data?.[0]?.quantity;
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 0
    ? quantity
    : null;
}

export async function createAdditionalListingCheckoutSession(params: {
  clerkUserId: string;
  hostProfileId: string;
  /** The host's stored tier — decides the price AND is recorded on the purchase. */
  hostSubscriptionTier: AdditionalListingTier;
  /** How many extra active listings to buy. Validated by the caller. */
  quantity: number;
  /** The host's Clerk email, used to find their existing Stripe customer when
   * the metadata search misses. Same resolution the plan checkout uses. */
  customerEmail?: string | null;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const unitAmountCents = ADDITIONAL_LISTING_PRICING[params.hostSubscriptionTier];
  const envPriceId = process.env[ADDITIONAL_LISTING_PRICE_ENV[params.hostSubscriptionTier]];

  const metadata = {
    productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
    hostProfileId: params.hostProfileId,
    clerkUserId: params.clerkUserId,
    quantity: String(params.quantity),
    tier: params.hostSubscriptionTier,
    amountCents: String(unitAmountCents),
  } as const;

  // ATTACH THE HOST'S EXISTING CUSTOMER. This is what makes the add-on
  // cancellable.
  //
  // Passing neither `customer` nor `customer_email` makes Stripe mint a BRAND
  // NEW Customer for every add-on checkout, carrying no clerkUserId metadata.
  // createBillingPortalSession resolves its customer from exactly that metadata,
  // so it opens the host's PLAN customer — which does not contain the add-on
  // subscription. The host would be billed monthly with no self-serve way to
  // stop, while HostSettings tells them "To cancel an add-on, use Manage
  // billing". Same resolution and the same ensureCustomerMetadata call the plan
  // checkout makes, so both products land on ONE customer and the portal shows
  // both subscriptions.
  //
  // A host reaching this surface has a host profile, which under 083 means they
  // have paid for a plan, which means a customer exists. `customer_email` is
  // still supplied for the case where it does not — Stripe then creates one
  // customer that ensureCustomerMetadata will find next time, rather than a
  // fresh orphan on every purchase.
  const customer = await findStripeCustomer({
    clerkUserId: params.clerkUserId,
    customerEmail: params.customerEmail ?? null,
  });
  if (customer) {
    await ensureCustomerMetadata(customer.id, { clerkUserId: params.clerkUserId });
  }

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = envPriceId
    ? { price: envPriceId, quantity: params.quantity }
    : {
        quantity: params.quantity,
        price_data: {
          currency: "usd",
          unit_amount: unitAmountCents,
          recurring: { interval: "month" },
          product_data: { name: "Additional active listing" },
        },
      };

  return stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: params.clerkUserId,
    success_url: absoluteAppUrl("/host/settings?addon=listing"),
    cancel_url: absoluteAppUrl("/host/settings"),
    metadata,
    // The webhook reads the SUBSCRIPTION's metadata on cancellation, which is a
    // different object from the session's — without this, a cancelled add-on
    // would fall through to the host-plan branch and zero the host's tier.
    subscription_data: { metadata },
    line_items: [lineItem],
    customer: customer?.id,
    customer_email: customer ? undefined : params.customerEmail ?? undefined,
  });
}

/** Founder-locked invite pack sizes (ADR-028): 5 / 10 / 25 credits. */
export type InvitePackSize = (typeof INVITE_CREDIT_PACKS)[number]["credits"];

export function isInvitePackSize(value: number): value is InvitePackSize {
  return INVITE_CREDIT_PACKS.some((pack) => pack.credits === value);
}

/**
 * Checkout for an invite-credit pack (mode 'payment'). Prices come from the
 * founder-locked INVITE_CREDIT_PACKS contract (ADR-028) — optionally overridden
 * by a provisioned STRIPE_PRICE_INVITE_PACK_{N} price id, mirroring the boost
 * flow. The webhook lands the credits via syncInviteCreditPurchase (ledger row,
 * idempotent on session id). Invite credits are NON-REFUNDABLE
 * (INVITE_CREDITS_REFUNDABLE=false) — RefundReview must reject these.
 */
export async function createInviteCreditCheckoutSession(params: {
  clerkUserId: string;
  hostProfileId: string;
  credits: InvitePackSize;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const pack = INVITE_CREDIT_PACKS.find((p) => p.credits === params.credits);
  if (!pack) {
    throw new Error(`Unknown invite pack size: ${params.credits}`);
  }

  const envPriceId = process.env[`STRIPE_PRICE_INVITE_PACK_${pack.credits}`];

  const metadata = {
    productType:   "invite_credits",
    kind:          "invite_credits",
    hostProfileId: params.hostProfileId,
    clerkUserId:   params.clerkUserId,
    credits:       String(pack.credits),
    amountCents:   String(pack.priceCents),
  } as const;

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = envPriceId
    ? { price: envPriceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: { name: `${pack.credits} invite credits` },
        },
      };

  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.clerkUserId,
    success_url: absoluteAppUrl("/host/invites?credits=1"),
    cancel_url:  absoluteAppUrl("/host/billing"),
    metadata,
    line_items: [lineItem],
  });
}

export async function createBillingPortalSession(params: {
  clerkUserId: string;
  customerEmail: string | null;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const customer = await findStripeCustomer({
    clerkUserId: params.clerkUserId,
    customerEmail: params.customerEmail,
  });

  if (!customer) {
    throw new Error("No Stripe customer found for the current host.");
  }

  await ensureCustomerMetadata(customer.id, {
    clerkUserId: params.clerkUserId,
  });

  return getStripeClient().billingPortal.sessions.create({
    customer: customer.id,
    return_url: params.returnUrl,
  });
}

/**
 * Issue a REAL Stripe refund against a PaymentIntent. This is the single place
 * money actually moves on a refund — the admin server action calls it ONLY after
 * an admin has approved the request. It must NEVER be invoked on the host's
 * request, during verification, or speculatively.
 *
 * Guarded by hasStripeServerConfig(): when Stripe is not configured (local /
 * preview without keys) it returns a structured not-ok result instead of
 * throwing, so the caller can record a 'failed' outcome rather than crash. A full
 * refund is the default; pass amountCents to refund a partial amount (integer
 * cents — never dollars). Stripe is idempotent enough that a duplicate refund
 * attempt surfaces as a StripeError here, which we map to { ok: false }.
 */
/**
 * Cancel a host's active subscription immediately.
 *
 * Used when a SUBSCRIPTION refund is approved: returning the money while the
 * host keeps the tier is a straight loss. Cancelling in Stripe emits
 * customer.subscription.deleted, which syncSubscriptionEvent already handles by
 * writing the tier back down — so the entitlement change flows through the same
 * path as every other subscription state change rather than being duplicated
 * here.
 *
 * Finding no subscription is NOT an error: it may already have been cancelled,
 * or the refund may be for a host whose subscription lapsed. The caller should
 * treat that as nothing-to-do.
 */
export async function cancelHostSubscription(
  clerkUserId: string,
): Promise<{ ok: boolean; cancelled: boolean; error?: string }> {
  if (!hasStripeServerConfig()) {
    return { ok: false, cancelled: false, error: "Stripe is not configured on this environment." };
  }
  if (!clerkUserId) {
    return { ok: false, cancelled: false, error: "Missing Clerk user id." };
  }

  try {
    const stripe = getStripeClient();
    const customers = await stripe.customers.search({
      query: `metadata['clerkUserId']:'${clerkUserId.replace(/'/g, "")}'`,
      limit: 1,
    });
    const customer = customers.data[0];
    if (!customer) return { ok: true, cancelled: false };

    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 10,
    });
    if (subs.data.length === 0) return { ok: true, cancelled: false };

    for (const sub of subs.data) {
      await stripe.subscriptions.cancel(sub.id);
    }
    return { ok: true, cancelled: true };
  } catch (error) {
    const message =
      error instanceof Stripe.errors.StripeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown Stripe error.";
    return { ok: false, cancelled: false, error: message };
  }
}

export async function issueRefund(
  paymentIntentId: string,
  amountCents?: number,
  idempotencyKey?: string,
): Promise<{ ok: boolean; refundId?: string; error?: string }> {
  if (!hasStripeServerConfig()) {
    return { ok: false, error: "Stripe is not configured on this environment." };
  }
  if (!paymentIntentId) {
    return { ok: false, error: "Missing Stripe payment intent id." };
  }
  if (amountCents !== undefined && (!Number.isInteger(amountCents) || amountCents <= 0)) {
    return { ok: false, error: "Refund amount must be a positive integer of cents." };
  }

  try {
    // The idempotency key is the only thing standing between a retried approval
    // and a second real payout: with it Stripe replays the original refund, and
    // without it an identical request creates a NEW one. Callers derive it from
    // the refund_requests row id (refundIdempotencyKey).
    const refund = await getStripeClient().refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountCents !== undefined ? { amount: amountCents } : {}),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return { ok: true, refundId: refund.id };
  } catch (error) {
    const message =
      error instanceof Stripe.errors.StripeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Stripe refund failed.";
    return { ok: false, error: message };
  }
}

/* ─── Refund verification: what Stripe actually charged ────────────────────── */

export interface SubscriptionChargeLookup {
  readonly ok: boolean;
  readonly charge?: SubscriptionCharge;
  readonly error?: string;
}

/**
 * The host's most recent real subscription charge, read from Stripe.
 *
 * A subscription refund has no local purchase row — the charge lives on a Stripe
 * invoice — so before this existed the request recorded a null PaymentIntent and
 * whatever amount the host typed into the billing form. This resolves the actual
 * invoice and the PaymentIntent that paid it, which is what makes "we'll verify
 * the exact charge in Stripe" true.
 *
 * Finding nothing is returned as a not-ok result rather than thrown so callers
 * can refuse the refund with a readable reason instead of crashing.
 */
export async function findLatestHostSubscriptionCharge(
  clerkUserId: string,
): Promise<SubscriptionChargeLookup> {
  if (!hasStripeServerConfig()) {
    return { ok: false, error: "Stripe is not configured on this environment." };
  }
  if (!clerkUserId) {
    return { ok: false, error: "Missing Clerk user id." };
  }

  try {
    const stripe = getStripeClient();
    const customers = await stripe.customers.search({
      query: `metadata['clerkUserId']:'${searchQueryValue(clerkUserId)}'`,
      limit: 1,
    });
    const customer = customers.data[0];
    if (!customer) {
      return { ok: false, error: "No Stripe customer on record for this host." };
    }

    // `payments` holds the InvoicePayment list that carries the PaymentIntent in
    // current API versions; expanding it means selectLatestSubscriptionCharge
    // has something to read instead of always falling through to null.
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      status: "paid",
      limit: 20,
      expand: ["data.payments"],
    });

    const charge = selectLatestSubscriptionCharge(invoices.data as unknown[]);
    if (!charge) {
      return { ok: false, error: "No paid subscription invoice found for this host." };
    }

    return { ok: true, charge };
  } catch (error) {
    return { ok: false, error: stripeErrorMessage(error, "Stripe invoice lookup failed.") };
  }
}

/**
 * How much of a charge Stripe can still give back: what it received, minus every
 * refund on it that is not dead. Used to REFUSE an over-refund before any money
 * moves, and it is also what stops a second approval of the same purchase from
 * paying out twice even if the request rows diverge.
 */
export async function getRefundableChargeCents(
  paymentIntentId: string,
): Promise<{ ok: boolean; refundableCents?: number; error?: string }> {
  if (!hasStripeServerConfig()) {
    return { ok: false, error: "Stripe is not configured on this environment." };
  }
  if (!paymentIntentId) {
    return { ok: false, error: "Missing Stripe payment intent id." };
  }

  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const received =
      typeof intent.amount_received === "number" ? intent.amount_received : 0;

    const priorRefunds = await stripe.refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
    });

    return {
      ok: true,
      refundableCents: refundableCents(received, refundedCents(priorRefunds.data as unknown[])),
    };
  } catch (error) {
    return { ok: false, error: stripeErrorMessage(error, "Stripe charge lookup failed.") };
  }
}

function stripeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function verifyStripeWebhookEvent(
  payload: string,
  signature: string,
): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    requireEnv("STRIPE_WEBHOOK_SECRET"),
  );
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  switch (event.type) {
    // Both events carry a Checkout.Session and must grant identically, so the
    // labels are stacked. (The eslint-disable that used to sit here suppressed
    // no-fallthrough, which stacked labels never trigger — an unused directive
    // reads as a warning the rule is holding something back when it is not.)
    // `completed` for a
    // delayed-notification payment (ACH/SEPA and friends) arrives UNPAID and is
    // deferred inside syncCheckoutCompleted; async_payment_succeeded is where
    // the money actually lands, so it has to run the same path.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return syncCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    // The payment failed after checkout "completed". Nothing was granted
    // (completed was deferred), so this only needs recording — but it must not
    // fall through to the generic ignore, which would hide a real failure.
    case "checkout.session.async_payment_failed":
      return {
        action: "async_payment_failed",
        clerkUserId:
          typeof (event.data.object as Stripe.Checkout.Session).metadata?.clerkUserId ===
          "string"
            ? ((event.data.object as Stripe.Checkout.Session).metadata
                ?.clerkUserId as string)
            : null,
        tier: null,
      };
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return syncSubscriptionEvent(event.data.object as Stripe.Subscription, false);
    case "customer.subscription.deleted":
      return syncSubscriptionEvent(event.data.object as Stripe.Subscription, true);
    default:
      return {
        action: `ignored_${event.type}`,
        clerkUserId: null,
        tier: null,
      };
  }
}