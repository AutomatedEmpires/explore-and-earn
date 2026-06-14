import "server-only";

import Stripe from "stripe";
import { adminClient, insertHostAnnouncement } from "@explore-and-earn/db";
import {
  ANNOUNCEMENT_PRICING,
  FOUNDER_LOCKED_PRICING,
  type AnnouncementDuration,
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
  const durationRaw = session.metadata?.durationDays;
  const durationDays = durationRaw ? parseInt(durationRaw, 10) : null;

  if (!clerkUserId || !hostProfileId || !durationDays) {
    return { action: "ignored_missing_announcement_metadata", clerkUserId, tier: null };
  }

  const validDurations: AnnouncementDuration[] = [7, 14, 28];
  if (!validDurations.includes(durationDays as AnnouncementDuration)) {
    return { action: "ignored_invalid_announcement_duration", clerkUserId, tier: null };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationDays);

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  await insertHostAnnouncement({
    hostProfileId,
    title:                  "",
    body:                   "",
    kind:                   "general",
    expiresAt:              expiresAt.toISOString(),
    status:                 "draft",
    stripePaymentIntentId:  paymentIntentId,
    purchaseDurationDays:   durationDays,
    purchaseAmountCents:    ANNOUNCEMENT_PRICING[durationDays as AnnouncementDuration],
  });

  return { action: "created_announcement_draft", clerkUserId, tier: null };
}

async function syncCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<{ action: string; clerkUserId: string | null; tier: StoredSubscriptionTier | null }> {
  if (session.metadata?.productType === "announcement") {
    return syncAnnouncementPurchase(session);
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

const ANNOUNCEMENT_PRICE_ENV: Record<AnnouncementDuration, string> = {
  7:  "STRIPE_PRICE_ANNOUNCEMENT_7D",
  14: "STRIPE_PRICE_ANNOUNCEMENT_14D",
  28: "STRIPE_PRICE_ANNOUNCEMENT_28D",
};

function absoluteAppUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "https://exploreandearn.com";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function createAnnouncementCheckoutSession(params: {
  clerkUserId: string;
  hostProfileId: string;
  durationDays: AnnouncementDuration;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripeClient();
  const priceId = requireEnv(ANNOUNCEMENT_PRICE_ENV[params.durationDays]);

  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.clerkUserId,
    success_url: absoluteAppUrl("/community?tab=announcements&purchased=1"),
    cancel_url:  absoluteAppUrl("/community?tab=announcements"),
    metadata: {
      productType:   "announcement",
      hostProfileId: params.hostProfileId,
      clerkUserId:   params.clerkUserId,
      durationDays:  String(params.durationDays),
    },
    line_items: [{ price: priceId, quantity: 1 }],
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