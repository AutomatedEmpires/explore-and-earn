// The INTERNAL billing smoke product — the one Stripe object in this repo that
// is deliberately NOT part of the sellable catalog.
//
// WHY IT EXISTS. Test mode proves Stripe's lifecycle; it cannot prove that THIS
// deployment's live keys, live webhook endpoint, signing secret and Supabase
// service role are wired to each other. Only a real charge on the live ledger
// proves that, and the founder should not have to buy a $199 plan to find out.
// So there is a live $1/month price that grants the same entitlement path, is
// bought once by the owner, verified, then cancelled and refunded.
//
// WHY IT IS SAFE. Two independent properties keep it out of the product:
//
//   1. It is never wired to an env var. resolveStripePriceId (services/stripe)
//      only ever returns prices named by the public STRIPE_PRICE_* vars, and
//      hasStripeCheckoutConfig ignores anything outside that set. A price with
//      no env var is unreachable from every public checkout surface by
//      construction, not by convention.
//   2. internal-price-isolation.test.mjs scans apps/web for the lookup key and
//      fails the build if it ever appears there — so a future change that tried
//      to reference it from the app cannot land quietly.
//
// The grant still works because syncCheckoutCompleted reads the TIER from
// session.metadata.subscriptionTier, not from the price. That is the whole
// mechanism: an internal price, a real charge, a real webhook, a real grant.
//
// REVENUE REPORTING. Every object this file creates carries
// metadata.internal_billing_test = "true". Any revenue figure computed from
// Stripe MUST filter it out; see docs/runbooks/billing-live-smoke.md.

/** Metadata key + value stamped on every internal smoke object. */
export const INTERNAL_TEST_METADATA_KEY = "internal_billing_test";
export const INTERNAL_TEST_METADATA_VALUE = "true";

/**
 * The internal smoke price, described exactly once.
 *
 * `unitAmountCents` is deliberately NOT sourced from the founder-locked pricing
 * contracts: this is not a product, it is an instrument, and tying it to the
 * contracts would make it move when real prices move.
 */
export const INTERNAL_SMOKE_PRICE = Object.freeze({
  productName: "Internal billing smoke",
  productDescription:
    "Internal billing verification instrument. NOT for sale. Charged only by the owner to prove the live billing path end to end, then refunded. Exclude from all revenue reporting.",
  catalogKey: "internal_billing_smoke",
  lookupKey: "ee_internal_billing_smoke",
  unitAmountCents: 100,
  currency: "usd",
  interval: "month",
});

/**
 * The tier the smoke checkout claims in session metadata.
 *
 * It must be a REAL tier or syncCheckoutCompleted's isHostSubscriptionTier
 * check rejects it and nothing is granted — which would make the smoke prove
 * nothing. Starter is the smallest real grant, so the blast radius of a smoke
 * run that is never cleaned up is one starter host.
 */
export const INTERNAL_SMOKE_TIER = "starter";

/** Metadata stamped on every internal smoke Stripe object. */
export function internalSmokeMetadata(extra = {}) {
  return {
    [INTERNAL_TEST_METADATA_KEY]: INTERNAL_TEST_METADATA_VALUE,
    ...extra,
  };
}

/**
 * Does this Stripe object carry the internal-test marker?
 *
 * Used as a REFUSAL, not a label: the cleanup path refunds nothing whose
 * subscription fails this check, so a mistyped subscription id can never refund
 * a real customer's plan. Reporting code should use the same predicate to
 * exclude these objects from revenue.
 *
 * @param {{metadata?: Record<string, unknown>} | null | undefined} object
 */
export function isInternalBillingTestObject(object) {
  const value = object?.metadata?.[INTERNAL_TEST_METADATA_KEY];
  return value === INTERNAL_TEST_METADATA_VALUE;
}

/**
 * The checkout-session metadata the smoke run mints.
 *
 * `subscriptionTier` and `clerkUserId` are the two keys syncCheckoutCompleted
 * actually reads; the marker rides alongside so the resulting objects are
 * identifiable in the dashboard and excludable from reporting.
 *
 * @param {string} clerkUserId
 */
export function internalSmokeSessionMetadata(clerkUserId) {
  if (typeof clerkUserId !== "string" || clerkUserId.length === 0) {
    throw new Error("internalSmokeSessionMetadata: clerkUserId is required");
  }
  return internalSmokeMetadata({
    subscriptionTier: INTERNAL_SMOKE_TIER,
    clerkUserId,
  });
}
