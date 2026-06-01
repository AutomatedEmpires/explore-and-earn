# Proposed Billing Guardrails V1

> **DRAFT.** Maps the directive's required guardrails to concrete, enforceable checks. Existing `G*` IDs are workspace canon; `G-BILL-*` are **proposed** new checks for founder/lead review. Nothing here is wired into CI by this pack.

## Mapped to existing guardrails

| Guardrail | Check type | Concrete assertion |
| --- | --- | --- |
| G1 | eslint + unit | no numeric pricing literals outside `pricing.ts`/catalog; amounts are integer cents |
| G4 | eslint + rls test | no seeker-scope read of billing tables; no `ee_audience='seeker'` metadata |
| G5 | eslint (no-restricted-syntax) | `stripe.refunds.create` only under `services/refund-review/` |
| G8 | dependency-cruiser | `services/matching` cannot import pricing/entitlements/boost/featured |
| G14 | unit/integration | every billing mutation route calls `requireEntitlement` |
| G15 | integration | billing mutation + audit row in one transaction |
| G17 | integration | webhook upserts `stripe_webhook_events(event_id)`; duplicate → no-op |
| G20 | unit | risky surfaces gated by default-off flag |
| G21 | unit | `featured_employer` never in any plan's default entitlement set; boost ≠ featured |
| G23 | unit | boost/team-seat constants in cents (20000/35000/50000; 4900) |
| G24 | unit/integration | founding seat: server-side cap 100, never decremented; cap-race downgrades, never cancels |
| G29 | unit | service credit FIFO + 12mo expiry; emits `service_credit.expired` |

## Proposed NEW checks (for review)

| ID | Check type | Assertion | Rationale |
| --- | --- | --- | --- |
| G-BILL-1 | eslint | no Stripe SDK import under `packages/contracts/**` or `packages/stripe-seed/**` | contracts/seed stay type/data-only |
| G-BILL-2 | secret scan | block `sk_live_`, `sk_test_`, `whsec_` literals anywhere in repo | no committed keys |
| G-BILL-3 | unit | `evaluateSeedSafety` hard-stops on live mode / live key | seed safety invariant |
| G-BILL-4 | unit | `buildSeedManifest().hash` matches `expected-stripe-manifest.json` | catalog drift detection |
| G-BILL-5 | unit | `STRIPE_PRICE_KEYS` / `STRIPE_PRODUCT_KEYS` ≡ `stripe-seed` catalog keys | single SKU source of truth |
| G-BILL-6 | eslint | no `process.env.STRIPE_SECRET_KEY` in client/`'use client'` files | server-only secrets |
| G-BILL-7 | dependency-cruiser | only `apps/web/app/api/v1/billing/**` + `services/stripe` may import the Stripe client | billing code not in public routes |
| G-BILL-8 | unit | every `BILLING_ROUTES` mutation has `founderGated` or an entitlement requirement | gate completeness |
| G-BILL-9 | unit | `NON_REFUNDABLE_OBJECT_TYPES` rejection path returns `non_refundable_product` | refund policy invariant |
| G-BILL-10 | unit | no `match_score` write from boost/featured code paths | exposure-only (reinforces G8) |

## Suggested tooling

- ESLint `no-restricted-syntax` / `no-restricted-imports` for G5, G-BILL-1/6/7.
- `dependency-cruiser` for boundary rules (G8, G-BILL-7).
- Vitest/Jest unit suites for cents/manifest/safety invariants.
- `run_secret_scanning` (already available) in CI for G-BILL-2.

All wiring is deferred; founder/lead approval required before enforcing new IDs.
