import "server-only";

import { FOUNDER_LOCKED_PRICING } from "@explore-and-earn/contracts";

/**
 * Stripe price ids for the founding-host rates (commercial redesign D10).
 *
 * A THIN MODULE BESIDE services/stripe RATHER THAN INSIDE IT, because the
 * property that matters most about this path is that it is DARK BY DEFAULT and
 * that has to be readable in one screen. Six environment variables; every one of
 * them unset means `resolveFoundingPriceId` returns null, which means
 * `hasFoundingCheckoutConfig()` is false, which means no surface offers a
 * founding checkout and the server refuses one if a form is forged. There is no
 * inline `price_data` fallback here — unlike boost and the additional-listing
 * add-on, where an unset env var falls back to the contract price — precisely so
 * that a missing variable cannot silently start selling a discount.
 *
 * The prices already exist in Stripe under the lookup keys ee_founding_*; wiring
 * them is a deployment act (six env vars), not a code change, which is what
 * keeps the go-live decision the founder's.
 *
 * The AMOUNTS are not stated here and must never be. FOUNDING_LOCKED_PRICING in
 * packages/contracts is the one place they live, the pricing guardrail enforces
 * that, and this module's job is only to name the Stripe object that charges
 * them. It imports FOUNDER_LOCKED_PRICING solely to borrow the tier key type, so
 * a new tier cannot be added to the plans without this map failing to compile.
 */

export type FoundingTier = keyof typeof FOUNDER_LOCKED_PRICING;
export type FoundingInterval = "monthly" | "yearly";

const FOUNDING_PRICE_ENV: Record<
  FoundingTier,
  Record<FoundingInterval, string>
> = {
  starter: {
    monthly: "STRIPE_PRICE_FOUNDING_STARTER_MONTHLY",
    yearly: "STRIPE_PRICE_FOUNDING_STARTER_YEARLY",
  },
  professional: {
    monthly: "STRIPE_PRICE_FOUNDING_PROFESSIONAL_MONTHLY",
    yearly: "STRIPE_PRICE_FOUNDING_PROFESSIONAL_YEARLY",
  },
  enterprise: {
    monthly: "STRIPE_PRICE_FOUNDING_ENTERPRISE_MONTHLY",
    yearly: "STRIPE_PRICE_FOUNDING_ENTERPRISE_YEARLY",
  },
};

/** Every founding price env var name, for configuration checks and diagnostics. */
export const FOUNDING_PRICE_ENV_NAMES: readonly string[] = Object.values(
  FOUNDING_PRICE_ENV,
).flatMap((byInterval) => Object.values(byInterval));

/**
 * The Stripe price id for a founding rate, or null when it is not provisioned.
 *
 * Null is the answer on this environment, today, and it is the answer the whole
 * path is designed around: a caller that cannot resolve a price must refuse the
 * checkout rather than fall back to the standard rate. Charging a host the full
 * price on a page that offered them the founding one is the single worst outcome
 * available here, so it is not reachable.
 */
export function resolveFoundingPriceId(
  tier: FoundingTier,
  interval: FoundingInterval,
): string | null {
  const value = process.env[FOUNDING_PRICE_ENV[tier][interval]];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * True only when ALL SIX founding prices are provisioned.
 *
 * Deliberately all-or-nothing, mirroring hasStripeCheckoutConfig. A partial
 * configuration would offer the founding rate on some tier/interval pairs and
 * not others, and a host who picked the wrong combination would meet a refusal
 * they could not act on. Six variables is one deployment step; three is a bug
 * report.
 */
export function hasFoundingCheckoutConfig(): boolean {
  return (Object.keys(FOUNDING_PRICE_ENV) as FoundingTier[]).every((tier) =>
    (["monthly", "yearly"] as FoundingInterval[]).every(
      (interval) => resolveFoundingPriceId(tier, interval) !== null,
    ),
  );
}

/**
 * The tier and interval a founding price id belongs to, or null.
 *
 * THIS IS THE HALF THAT IS EASY TO FORGET AND EXPENSIVE TO OMIT. Subscription
 * webhooks resolve a tier by looking the price id up; a founding subscription
 * whose price is unknown to that lookup answers
 * "ignored_unmapped_subscription_price", so the host's renewals, lapses and
 * cancellation would never move their entitlement again. The founding prices are
 * therefore part of the same lookup as the standard ones.
 */
export function resolveTierFromFoundingPriceId(
  priceId: string,
): { tier: FoundingTier; interval: FoundingInterval } | null {
  for (const tier of Object.keys(FOUNDING_PRICE_ENV) as FoundingTier[]) {
    for (const interval of ["monthly", "yearly"] as FoundingInterval[]) {
      if (resolveFoundingPriceId(tier, interval) === priceId) {
        return { tier, interval };
      }
    }
  }
  return null;
}
