# @explore-and-earn/stripe-seed

Idempotent provisioner for the Explore & Earn Stripe catalog. Creates the
Products + Prices the app reads via the `STRIPE_PRICE_*` env vars, so a fresh
Stripe account can be made chargeable in one command.

## Source of truth

- **`catalog.mjs`** — the canonical catalog, **derived from the founder-locked
  pricing contracts** (`@explore-and-earn/contracts`). Never hand-edit amounts;
  change the pricing contracts and the catalog follows.
- **`expected-stripe-manifest.json`** — committed snapshot of `catalog.mjs`.
- **`catalog.test.mjs`** — drift guard: asserts `catalog.mjs` === the manifest
  === the pricing contracts. Run with `pnpm --filter @explore-and-earn/stripe-seed test`.
- **`provision.mjs`** — the idempotent create-or-reuse logic, shared by `seed.mjs`
  and `lifecycle-test.mjs` so the lifecycle prover exercises the catalog the
  founder actually seeds rather than a fork of it.

## Usage

```bash
# 1. Build the workspace so the catalog can import the pricing contracts.
pnpm --filter @explore-and-earn/contracts build

# 2. Seed TEST mode first, capturing the env block to stdout.
STRIPE_SECRET_KEY=sk_test_xxx pnpm --filter @explore-and-earn/stripe-seed seed > stripe.test.env

# 3. Verify in the Stripe (test) dashboard, run a test checkout end-to-end, then
#    repeat with the LIVE key:
STRIPE_SECRET_KEY=sk_live_xxx pnpm --filter @explore-and-earn/stripe-seed seed > stripe.live.env
```

`seed.mjs` prints the `STRIPE_PRICE_*=price_…` block on **stdout** (paste into
Vercel → Project → Settings → Environment Variables, Production) and human
progress on **stderr**. It is **idempotent**: prices are keyed by a stable
`lookup_key` and products by `metadata.ee_catalog_key`, so re-running reuses the
existing catalog instead of duplicating it.

`STRIPE_PRICE_BOOST_*` are **optional** — the boost checkout falls back to inline
`price_data` from the pricing contract when they are unset.

## Verifying the lifecycle (test mode, free)

```bash
STRIPE_TEST_SECRET_KEY=sk_test_xxx pnpm --filter @explore-and-earn/stripe-seed lifecycle
```

`lifecycle-test.mjs` provisions the catalog into test mode, then drives a whole
subscription lifetime through a Stripe **test clock** — subscribe, renew,
monthly↔yearly with proration, add-on subscribe / quantity change / cancel,
payment failure to `past_due`, cancel — printing PASS/FAIL with Stripe object ids
and exiting non-zero on any failure. It **refuses to run against a live key**
with no override.

## The internal smoke instrument

`internal-smoke.mjs` defines the private **live** $1/month price used by the
owner-only live smoke (`tools/scripts/billing-live-smoke.mjs`). It is not part of
the sellable catalog and is never wired to an env var;
`internal-price-isolation.test.mjs` fails the build if it ever appears in
`apps/web` or enters the catalog manifest.

Full picture of all three verification layers:
[`docs/runbooks/billing-verification.md`](../../docs/runbooks/billing-verification.md).

Do not commit the generated `*.env` files. See
[`docs/runbooks/launch-provisioning.md`](../../docs/runbooks/launch-provisioning.md)
for the full launch provisioning sequence (Stripe, Clerk, Vercel, GitHub).
