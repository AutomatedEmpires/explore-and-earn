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
//
// The create/reuse logic itself lives in provision.mjs, shared with
// lifecycle-test.mjs so the lifecycle prover exercises the SAME catalog the
// founder seeds rather than a fork of it.
import Stripe from "stripe";

import { CATALOG } from "./catalog.mjs";
import { isLiveModeKey, provisionCatalog, STRIPE_API_VERSION } from "./provision.mjs";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error(
    "[stripe-seed] STRIPE_SECRET_KEY is required. Use a sk_test_ key first, verify, then sk_live_.",
  );
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
const live = isLiveModeKey(secretKey);
console.error(`[stripe-seed] mode: ${live ? "LIVE" : "TEST"} — ${CATALOG.length} products`);

const { envLines } = await provisionCatalog(stripe, {
  log: (line) => console.error(line),
});

console.error("\n[stripe-seed] done. Paste the block below into Vercel (Production) env:\n");
console.log(envLines.join("\n"));
