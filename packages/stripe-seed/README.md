# @explore-and-earn/stripe-seed

> **DRAFT / PLACEHOLDER.** This package will seed Stripe **test-mode** products, prices, and founding coupons from canon. It does **not** run live, does not hold secrets, and is not auto-executed in CI.

## Safety contract (non-negotiable)

- **Test-mode only.** A live key triggers a hard stop (`src/safety.ts`).
- **Dry-run first.** `src/dry-run.ts` prints the intended catalog and computes a manifest hash; CI compares it to the checked-in `expected-stripe-manifest.json`. No writes.
- **No real secret keys** in the repo or CI. Keys come from the operator's local env at run time only.
- **No automatic execution in CI.** CI may run dry-run hash comparison only.
- **No production writes.** Live mode requires founder approval (gate P-PROD) and a separate, manual, audited run.

## Intended behavior (later, gated)

1. Read canon from `packages/contracts/src/pricing.ts` (amounts) + Stripe key catalog (`src/catalog.ts`).
2. Idempotently upsert Stripe products/prices/coupons by conventional name.
3. Write resolved IDs to `stripe_object_map(conventional_name, stripe_id, livemode)`.
4. Attach required metadata (`ee_sku`, `ee_object_type`, `ee_entitlements`, `ee_plan_tier`, `ee_surface`, `ee_audience=host`, `ee_livemode_guard`).
5. Nightly `reconcileStripe()` diffs Stripe vs mirror and raises `admin_alerts` on drift.

## What is NOT implemented now

- No Stripe SDK calls. No network. No secrets. No live/test product creation.
- `src/catalog.ts` lists conventional keys only (no amounts — amounts stay in `pricing.ts`, guardrail G1).

## Open question

**Q-BILL-1:** `pricing.ts` amounts are in **dollars** but G1/G23 expect **integer cents**. The seed must read integer cents; normalization is founder-gated (P-UNIT). Until resolved, the seed must not run.
