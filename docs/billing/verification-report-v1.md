# Payments V1 — Verification Report (2026-05-31)

> Point-in-time verification of `payments/v1-build-pack` (Draft PR #9) by the VS Code verifier (GitHub Copilot), plus the enforcement wired in response. Records what is **clean**, what is **enforced vs only documented**, and what must be **escalated**. The canonical guardrail catalog stays in `proposed-guardrails-billing-v1.md`.

## Summary

The billing slice compiles and lints cleanly and holds all architecture-only invariants. Following founder approval on 2026-05-31, the four open billing questions are now **resolved against canon** (no values invented; every change traces to a canon page):

- **Q-BILL-1 / Gate P-UNIT** — `packages/contracts/src/pricing.ts` is normalized from dollars to **integer USD cents** (x100 from the founder-locked dollar canon, ADR-028). `pricing.ts` is now the single source of truth for every amount (plans, founding discounts, add-ons, boosts, invite packs, team seat, announcement) plus plan-included entitlement counts (G1). `check-pricing-units.mjs` is now **green**.
- **Q-BILL-2** — `CampaignStatus` / `CampaignDeliveryStatus` member values now mirror the Canonical Enum Registry exactly.
- **Q-BILL-3** — billing entity field lists + sub-enums (`AddOnPurchaseStatus`, `InviteCreditSourceType`, `InviteCreditRelatedObjectType`) now mirror the Field-Level Billing Dictionary; `add_on_type` aligned to the dictionary token `announcement`.
- **G-BILL-4** — `expected-stripe-manifest.json` is populated with the canonical structural catalog (33 entries: 9 products, 18 prices, 6 coupons) and enforced by the new `check-stripe-manifest.mjs` (set-based drift check; amounts excluded per G1).

## A. Type-check

- Focused billing type-check **passes**: `billing.ts`, `billing-routes.ts`, `billing-events.ts`, `entitlements.ts`, `stripe.ts`, `refund-review.ts` compile and re-export via `packages/contracts/src/index.ts`. No file consumes the realigned entity field names, so the Q-BILL-3 rename is type-safe.
- `stripe-seed` `manifest.ts` + `reconcile.ts` compile against `catalog.ts`.
- **Out of scope / pre-existing:** workspace-wide `tsc -b` fails in generated `.next` validator files (`apps/web` route-group layout modules missing from generated output). Unrelated to the billing branch and not introduced here.

## B. Lint

Workspace lint passes; no errors/warnings in changed billing files.

## C. Test

No active unit-test runner is wired for billing packages yet. Enforcement on this branch runs through the `guardrails` npm script (`tools/scripts/*.mjs`), not a unit-test framework. Wiring a test runner is implementation-phase work.

## D. Guardrail enforcement status

Legend: **enforced** = a wired check fails on violation; **documented** = contract/doc only; **n/a-branch** = cannot be evaluated until implementation tables/handlers exist.

| Guardrail | Status | Note |
| --- | --- | --- |
| G1 / P-UNIT | **enforced (green)** | `check-pricing-units.mjs` asserts canon integer cents; `pricing.ts` normalized (Q-BILL-1 resolved, founder-approved 2026-05-31) |
| G5 | **enforced** | `check-refund-isolation.mjs` fails if `refunds.create()` appears outside the refund-review service (currently none) |
| G-BILL-1 | **enforced** | `check-no-stripe-sdk.mjs` fails on any Stripe SDK import in contracts/stripe-seed (currently none) |
| G-BILL-2 | **enforced** | `check-no-secrets.mjs` fails on committed `sk_live_`/`sk_test_`/`rk_live_`/`whsec_` key bodies (prefix-only mentions ignored) |
| G-BILL-3 | **enforced** | `check-seed-safety.mjs` fails if the live-mode hard stop in `safety.ts` is weakened/removed |
| G-BILL-4 | **enforced** | `check-stripe-manifest.mjs` fails on drift between `expected-stripe-manifest.json` and the conventional catalog in `catalog.ts` |
| G-BILL-5 | **enforced** | `check-sku-parity.mjs` fails on SKU drift between `contracts/src/stripe.ts` and `stripe-seed/src/catalog.ts` |
| G23 | partial | boost/team-seat cent constants live in `pricing.ts`; covered indirectly by the cents gate, no dedicated test |
| G4 | n/a-branch | `ee_audience` hard-coded `host`; RLS/table half needs billing tables |
| G8 | documented | only a placeholder string scan exists; weaker than the documented dependency + match_score rule |
| G14 | n/a-branch | route metadata only; no handlers / `requireEntitlement` yet |
| G15 | n/a-branch | no mutations / transactions / audit rows yet |
| G17 | n/a-branch | no webhook handler / `stripe_webhook_events` yet |
| G20 | n/a-branch | no feature-flag/default-off code yet |
| G21 | n/a-branch | default plan entitlement sets not encoded yet |
| G24 | n/a-branch | no founding seat / cap logic yet |
| G29 | n/a-branch | service-credit FIFO/expiry not implemented yet |
| G-BILL-6..10 | documented | no wired checks; no implementation paths yet to enforce against |

## Wired guardrail checks (in the `guardrails` npm script)

Order: `db:assert` -> `check-pricing.mjs` (legacy literals) -> `check-calendar-sync.mjs` -> `check-match-isolation.mjs` -> `check-no-stripe-sdk.mjs` -> `check-no-secrets.mjs` -> `check-sku-parity.mjs` -> `check-refund-isolation.mjs` -> `check-seed-safety.mjs` -> `check-stripe-manifest.mjs` -> `check-pricing-units.mjs`.

All checks are now expected **green** on the branch.

## E. Invariant check (all hold)

- No Stripe SDK import anywhere on the branch (enforced by `check-no-stripe-sdk.mjs`).
- No committed secret bodies (enforced by `check-no-secrets.mjs`).
- No price amounts outside `packages/contracts/src/pricing.ts`.
- `stripe-seed/src/safety.ts` live-mode hard stop confirmed (guarded by `check-seed-safety.mjs`).
- No network calls in any `stripe-seed/src/*` file.
- No SKU drift between `contracts/src/stripe.ts` and `stripe-seed/src/catalog.ts` (enforced by `check-sku-parity.mjs`).
- Expected Stripe manifest matches the conventional catalog (enforced by `check-stripe-manifest.mjs`).

## F. Resolved (founder-approved 2026-05-31)

- **Q-BILL-1 / P-UNIT:** `pricing.ts` normalized dollars -> integer cents (x100 of the ADR-028 dollar canon); cents gate green. No pricing invented.
- **Q-BILL-2:** `CampaignStatus` / `CampaignDeliveryStatus` set from the Canonical Enum Registry.
- **Q-BILL-3:** billing entity field lists + sub-enums set from the Field-Level Billing Dictionary.
- **Expected manifest:** populated from the SKU Catalog and enforced by `check-stripe-manifest.mjs` (G-BILL-4 now live).

## Enforcement backlog (deferred, not gated by canon)

Implement during the relevant phases of `implementation-sequencing-v1.md`: real `no-pricing-literals` ESLint AST rule; G8 dependency-cruiser boundary; G14/G15/G17/G20/G21/G24/G29 (need implementation code); a runtime hash assertion for `buildSeedManifest()` once a test runner is wired; G-BILL-6/7 (client-secret + Stripe-client import boundary, need app code); G-BILL-8/9/10 (need routes/handlers). None block the build pack; they harden future implementation PRs.
