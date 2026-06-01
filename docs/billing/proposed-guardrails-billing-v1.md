# Proposed Billing Guardrails V1

> **DRAFT.** Maps the directive's required guardrails to concrete, enforceable checks. Existing `G*` IDs are workspace canon; `G-BILL-*` are **proposed** new checks for founder/lead review. **Wiring status (2026-05-31):** G1, G5, G-BILL-1, G-BILL-2, G-BILL-3, G-BILL-4, and G-BILL-5 are wired green in the `guardrails` npm script; the remaining IDs are documented-only pending implementation code.

## Mapped to existing guardrails

| Guardrail | Check type | Concrete assertion |
| --- | --- | --- |
| G1 | eslint + unit | no pricing-amount literals in **runtime/app/SQL/seed** code (must import from `pricing.ts`); amounts are integer cents. **Scope note:** assertion gates (e.g. `check-pricing-units.mjs`, which must hold an independent copy of the canon cents to detect drift) and human-readable docs are **exempt** — they are canon mirrors, not runtime pricing. |
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
| G-BILL-4 | unit/script | `expected-stripe-manifest.json` (structural: 33 entries — 9 products, 18 prices, 6 coupons, amounts excluded) matches the `stripe-seed` catalog arrays; enforced by `check-stripe-manifest.mjs` (set-based, order-independent). The runtime `buildSeedManifest().hash` is retained for in-process checks. | catalog drift detection |
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

Remaining (unwired) IDs are deferred; founder/lead approval required before enforcing additional new IDs.
