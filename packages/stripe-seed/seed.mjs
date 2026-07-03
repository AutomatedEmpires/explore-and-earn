// Idempotent Stripe catalog provisioner. Run ONCE per environment (test first,
// then live) to create the Products + Prices the app reads via the STRIPE_PRICE_*
// env vars. Safe to re-run: every Price is keyed by a stable lookup_key, so an
// existing price is reused, never duplicated; products are matched on our own
// metadata.ee_catalog_key (stable across renames).
//
//   # build the workspace first (the catalog imports the pricing contracts)
//   pnpm --filter @explore-and-earn/contracts build
//   # then seed (test mode), capturing the env block:
//   STRIPE_SECRET_KEY=sk_test_... node packages/stripe-seed/seed.mjs > stripe.test.env
//
// stdout = the STRIPE_PRICE_*=price_... block to paste into Vercel.
// stderr = human progress. See docs/runbooks/launch-provisioning.md.
import Stripe from "stripe";

import { CATALOG, CATALOG_CURRENCY } from "./catalog.mjs";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error(
    "[stripe-seed] STRIPE_SECRET_KEY is required. Use a sk_test_ key first, verify, then sk_live_.",
  );
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: "2026-05-27.dahlia" });
const live = secretKey.startsWith("sk_live_");
console.error(`[stripe-seed] mode: ${live ? "LIVE" : "TEST"} — ${CATALOG.length} products`);

async function findOrCreateProduct(product) {
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

async function findOrCreatePrice(productId, price) {
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

const envLines = [];
for (const product of CATALOG) {
  const stripeProduct = await findOrCreateProduct(product);
  for (const price of product.prices) {
    const stripePrice = await findOrCreatePrice(stripeProduct.id, price);
    envLines.push(`${price.envVar}=${stripePrice.id}`);
    const dollars = (price.unitAmountCents / 100).toFixed(2);
    const tag = price.optional ? " (optional)" : "";
    console.error(`  ✓ ${price.lookupKey} → ${stripePrice.id}  $${dollars}${tag}`);
  }
}

console.error("\n[stripe-seed] done. Paste the block below into Vercel (Production) env:\n");
console.log(envLines.join("\n"));
