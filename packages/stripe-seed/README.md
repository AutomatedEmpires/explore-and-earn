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

Do not commit the generated `*.env` files. See
[`docs/runbooks/launch-provisioning.md`](../../docs/runbooks/launch-provisioning.md)
for the full launch provisioning sequence (Stripe, Clerk, Vercel, GitHub).
