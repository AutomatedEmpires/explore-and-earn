import "server-only";

import Stripe from "stripe";
import {
  adminClient,
  activateBoostCampaignFromCheckout,
  insertHostAnnouncement,
  type BoostPurchaseTier,
} from "@explore-and-earn/db";
import {
  ANNOUNCEMENT_PRICE_CENTS,
  ANNOUNCEMENT_RUN_DAYS,
  BOOST_DURATIONS,
  BOOST_PRICING,
  FOUNDER_LOCKED_PRICING,
  type BoostDuration,
} from "@explore-and-earn/contracts";

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

async function syncHostSubscriptionTier(
  clerkUserId: string,
  subscriptionTier: StoredSubscriptionTier,
): Promise<void> {
  const db = adminClient();
  const { error } = await db
    .from("host_profiles")
    .update({ subscription_tier: subscriptionTier })
    .eq("clerk_user_id", clerkUserId);

  if (error) {
    throw new Error(`Failed to sync host subscription tier: ${error.message}`);
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

async function syncCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  if (session.metadata?.productType === "announcement") {
    return syncAnnouncementPurchase(session);
  }

  if (session.metadata?.productType === "listing_boost") {
    return syncBoostPurchase(session);
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

  await syncHostSubscriptionTier(clerkUserId, subscriptionTier);

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

  if (customerId && tier !== "none") {
    await ensureCustomerMetadata(customerId, billingMetadata(clerkUserId, tier));
  }

  await syncHostSubscriptionTier(clerkUserId, tier);

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
export async function issueRefund(
  paymentIntentId: string,
  amountCents?: number,
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
    const refund = await getStripeClient().refunds.create({
      payment_intent: paymentIntentId,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
    });
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
    case "checkout.session.completed":
      return syncCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
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