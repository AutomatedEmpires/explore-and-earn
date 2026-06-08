import "server-only";

import Stripe from "stripe";

const APP_INFO = {
  name: "Explore & Earn",
  version: "0.1.0",
  url: "https://exploreandearn.com",
} as const;

const ACTIONABLE_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.paid",
  "invoice.payment_failed",
]);

let cachedStripeClient: Stripe | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} for Stripe server configuration.`);
  }

  return value;
}

export function hasStripeServerConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripePublishableKey(): string {
  return requireEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}

export function getStripeClient(): Stripe {
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      appInfo: APP_INFO,
    });
  }

  return cachedStripeClient;
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

export function getStripeWebhookDisposition(event: Stripe.Event): {
  actionable: boolean;
  message: string;
} {
  if (!ACTIONABLE_EVENT_TYPES.has(event.type)) {
    return {
      actionable: false,
      message: `Ignoring unsupported Stripe event type ${event.type}.`,
    };
  }

  return {
    actionable: true,
    message:
      "Stripe event verified, but billing mirror and entitlement handlers are not implemented yet.",
  };
}