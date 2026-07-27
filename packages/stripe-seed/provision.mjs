// Idempotent Stripe catalog provisioning, extracted from seed.mjs so more than
// one caller can use it.
//
// seed.mjs (founder-run, once per environment) and lifecycle-test.mjs (the
// test-mode lifecycle prover) must create the SAME catalog, or the lifecycle
// script proves something about prices the real app never sells. Forking the
// create/reuse logic is how those two drift, so it lives here once and both
// import it.
//
// Everything above `provisionCatalog` is PURE — no Stripe client, no network —
// which is what lifecycle.test.mjs exercises. Nothing in this module reads
// process.env; callers pass the client they built.
import { CATALOG, CATALOG_CURRENCY } from "./catalog.mjs";

/** Stripe API version every script in this package pins. One place to bump. */
export const STRIPE_API_VERSION = "2026-05-27.dahlia";

/**
 * Flatten the catalog into a lookup_key -> price descriptor index.
 *
 * The catalog is nested (product -> prices) but every consumer here addresses a
 * price by its stable `lookupKey`, which is also the only identifier that
 * survives a Stripe re-seed. Carrying `productKey` through means a caller can
 * still say which product a price belongs to without re-walking the tree.
 *
 * @param {typeof CATALOG} catalog
 * @returns {Map<string, {lookupKey: string, envVar: string, unitAmountCents: number, type: string, interval: string|null, optional: boolean, productKey: string, productName: string}>}
 */
export function catalogPriceIndex(catalog = CATALOG) {
  const index = new Map();

  for (const product of catalog) {
    for (const price of product.prices) {
      if (index.has(price.lookupKey)) {
        // The catalog test already asserts uniqueness; this makes a hand-edited
        // manifest fail loudly here too rather than silently losing a price.
        throw new Error(`duplicate catalog lookupKey: ${price.lookupKey}`);
      }
      index.set(price.lookupKey, {
        lookupKey: price.lookupKey,
        envVar: price.envVar,
        unitAmountCents: price.unitAmountCents,
        type: price.type,
        interval: price.interval ?? null,
        optional: price.optional === true,
        productKey: product.key,
        productName: product.name,
      });
    }
  }

  return index;
}

/**
 * The exact set of catalog prices the lifecycle script drives, resolved against
 * a provisioned test-mode catalog.
 *
 * Stated as data rather than inline string literals so the mapping is testable
 * without Stripe, and so a renamed lookup_key fails one assertion here instead
 * of failing halfway through a live-ish run with a confusing Stripe error.
 *
 * The add-on deliberately uses the STARTER additional-listing price: the plan
 * under test is starter, and 085 prices the add-on by the buyer's plan.
 */
export const LIFECYCLE_PRICE_KEYS = Object.freeze({
  planMonthly: "ee_starter_monthly",
  planYearly: "ee_starter_yearly",
  addOnMonthly: "ee_additional_listing_starter",
});

/**
 * Resolve the lifecycle price keys against a provisioned catalog.
 *
 * @param {Map<string, string>} provisioned lookupKey -> Stripe price id
 * @returns {{planMonthly: string, planYearly: string, addOnMonthly: string}}
 */
export function resolveLifecyclePrices(provisioned) {
  const resolved = {};
  const missing = [];

  for (const [role, lookupKey] of Object.entries(LIFECYCLE_PRICE_KEYS)) {
    const priceId = provisioned.get(lookupKey);
    if (!priceId) {
      missing.push(`${role} (${lookupKey})`);
      continue;
    }
    resolved[role] = priceId;
  }

  if (missing.length > 0) {
    throw new Error(
      `lifecycle prices missing from the provisioned catalog: ${missing.join(", ")}`,
    );
  }

  return resolved;
}

/**
 * True when the key addresses Stripe's TEST ledger.
 *
 * Restricted keys (`rk_test_` / `rk_live_`) are recognised too: the founder's
 * Doppler `dev` config could hold either shape, and reading a restricted test
 * key as "not test" would make the lifecycle script refuse a perfectly good key.
 * Anything unrecognised is reported as NOT test, so a script that guards on this
 * fails closed.
 *
 * @param {string} secretKey
 */
export function isTestModeKey(secretKey) {
  return (
    typeof secretKey === "string" &&
    (secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_"))
  );
}

/** True when the key addresses Stripe's LIVE ledger (real money). */
export function isLiveModeKey(secretKey) {
  return (
    typeof secretKey === "string" &&
    (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_"))
  );
}

async function findOrCreateProduct(stripe, product) {
  // Catalog is tiny; one list call is simpler and more reliable than search
  // (which is eventually consistent). Match on our own stable metadata key.
  const existing = await stripe.products.list({ limit: 100, active: true });
  const match = existing.data.find((p) => p.metadata?.ee_catalog_key === product.key);
  if (match) return match;
  return stripe.products.create({
    name: product.name,
    description: product.description,
    metadata: { ee_catalog_key: product.key },
  });
}

async function findOrCreatePrice(stripe, productId, price) {
  const found = await stripe.prices.list({ lookup_keys: [price.lookupKey], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({
    product: productId,
    currency: CATALOG_CURRENCY,
    unit_amount: price.unitAmountCents,
    lookup_key: price.lookupKey,
    transfer_lookup_key: true,
    ...(price.type === "recurring" ? { recurring: { interval: price.interval } } : {}),
    metadata: { ee_env_var: price.envVar },
  });
}

/**
 * Create (or reuse) every Product + Price in the catalog.
 *
 * Idempotent in both directions: prices are keyed by a stable `lookup_key` and
 * products by `metadata.ee_catalog_key`, so a re-run reuses what exists and
 * never duplicates. Safe to call at the top of the lifecycle script, which is
 * exactly why the script can be run against a brand-new test account.
 *
 * @param {import("stripe").Stripe} stripe
 * @param {{log?: (line: string) => void, catalog?: typeof CATALOG}} [options]
 * @returns {Promise<{priceIds: Map<string, string>, envLines: string[]}>}
 */
export async function provisionCatalog(stripe, options = {}) {
  const catalog = options.catalog ?? CATALOG;
  const log = options.log ?? (() => {});
  const priceIds = new Map();
  const envLines = [];

  for (const product of catalog) {
    const stripeProduct = await findOrCreateProduct(stripe, product);
    for (const price of product.prices) {
      const stripePrice = await findOrCreatePrice(stripe, stripeProduct.id, price);
      priceIds.set(price.lookupKey, stripePrice.id);
      envLines.push(`${price.envVar}=${stripePrice.id}`);
      const dollars = (price.unitAmountCents / 100).toFixed(2);
      const tag = price.optional ? " (optional)" : "";
      log(`  ok ${price.lookupKey} -> ${stripePrice.id}  $${dollars}${tag}`);
    }
  }

  return { priceIds, envLines };
}
