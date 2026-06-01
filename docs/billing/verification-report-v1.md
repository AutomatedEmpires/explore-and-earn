# Payments V1 — Verification Report (2026-05-31)

> Point-in-time verification of `payments/v1-build-pack` (Draft PR #9) by the VS Code verifier (GitHub Copilot). Records what is **clean**, what is **enforced vs only documented**, and what must be **escalated**. This is a status snapshot — the canonical guardrail catalog stays in `proposed-guardrails-billing-v1.md`.

## Summary

The billing slice compiles and lints cleanly and holds all architecture-only invariants. The single concrete billing defect is the **expected** dollars-vs-cents drift in `packages/contracts/src/pricing.ts` (Q-BILL-1). As of this report that drift is now caught by an automated gate (`tools/scripts/check-pricing-units.mjs`), which is **intended to be red** until the founder approves normalization (Gate P-UNIT).

## A. Type-check

- Focused billing type-check **passes**: `billing-routes.ts`, `billing-events.ts` compile; `PlanTier`, `BillingInterval`, `BillingStatus`, `EntitlementKey`, `StripePriceKey`, `StripeWebhookEventType` resolve and re-export via `packages/contracts/src/index.ts`.
- `stripe-seed` `manifest.ts` + `reconcile.ts` compile against `catalog.ts`.
- **Out of scope / pre-existing:** workspace-wide `tsc -b` fails in generated `.next` validator files (`apps/web` route-group layout modules missing from generated output). This is unrelated to the billing branch and is not introduced by this work.

## B. Lint

Workspace lint passes; no errors/warnings in changed billing files.

## C. Test

No active automated billing test suite exists yet (`pnpm test` is effectively a no-op for this branch; only a skipped Playwright placeholder exists). Enforcement on this branch runs through the `guardrails` npm script (`tools/scripts/*.mjs`), not a unit-test runner.

## D. Guardrail enforcement status

Legend: **enforced** = a wired check fails on violation; **documented** = contract/doc only, no wired check; **n/a-branch** = cannot be evaluated until implementation tables/handlers exist.

| Guardrail | Status | Note |
| --- | --- | --- |
| G1 / P-UNIT | **enforced (intended red)** | `check-pricing-units.mjs` now asserts canon integer cents; currently fails on the dollars drift (Q-BILL-1) by design |
| G4 | n/a-branch | `ee_audience` hard-coded `host` in `stripe.ts`; RLS/table half needs billing tables |
| G5 | documented | no restricted-import check yet; branch satisfies it (no SDK usage at all) |
| G8 | documented | only a placeholder string scan exists; weaker than the documented dependency + match_score rule |
| G14 | n/a-branch | route metadata only; no handlers / `requireEntitlement` yet |
| G15 | n/a-branch | no mutations / transactions / audit rows yet |
| G17 | n/a-branch | no webhook handler / `stripe_webhook_events` yet |
| G20 | n/a-branch | no feature-flag/default-off code yet |
| G21 | n/a-branch | default plan entitlement sets not encoded yet |
| G23 | partial | boost/team-seat cent constants are in contracts; covered indirectly by the cents gate, no dedicated test |
| G24 | n/a-branch | no founding seat / cap logic yet |
| G29 | n/a-branch | service-credit FIFO/expiry not implemented yet |
| G-BILL-1 | documented | no SDK-import lint rule; manual scan = no Stripe SDK imports |
| G-BILL-2 | documented | no repo secret-scan hook; manual scan = no `sk_live_`/`sk_test_`/`whsec_` |
| G-BILL-3 | partial | `safety.ts` hard stop exists; no unit test enforces it |
| G-BILL-4 | n/a-branch | `expected-stripe-manifest.json` is placeholder; canonical hash-match not meaningful yet |
| G-BILL-5 | documented | no unit check; manual comparison = no SKU drift |
| G-BILL-6..10 | documented | no wired checks; no implementation paths yet to enforce against |

**Net:** aside from the now-wired cents gate, guardrails remain contracts + docs. Wiring them is implementation-phase work and is intentionally deferred.

## E. Invariant check (all hold)

- No Stripe SDK import anywhere on the branch.
- No secret-looking strings (`sk_live_`, `sk_test_`, `whsec_`).
- No price amounts outside `packages/contracts/src/pricing.ts` (the only pricing-unit issue is inside that file).
- `stripe-seed/src/safety.ts` live-mode hard stop confirmed (live key + live write rejected).
- No network calls in any `stripe-seed/src/*` file.
- No SKU drift between `contracts/src/stripe.ts` and `stripe-seed/src/catalog.ts`.

## F. Escalate to founder

- **Q-BILL-1 / P-UNIT:** `pricing.ts` is dollar-based. The cents gate is now wired and red by design. Resolving requires a founder-approved dollars→cents normalization (do not normalize unilaterally).
- **Q-BILL-2:** `CampaignStatus` / `CampaignDeliveryStatus` member values still `TODO(?)`.
- **Q-BILL-3:** billing entity field lists still `TODO(?)` (leaves transaction/audit/webhook/seat checks underspecified).
- **Expected manifest canon:** `expected-stripe-manifest.json` is placeholder; G-BILL-4 stays inert until the expected manifest is approved.

## Enforcement backlog (deferred, not gated by canon)

Implement during the relevant phases of `implementation-sequencing-v1.md`: real `no-pricing-literals` ESLint rule; G5 restricted-import rule; G8 dependency-cruiser boundary; G-BILL-* unit tests (safety hard stop, manifest hash, SKU parity, non-refundable rejection). None of these block the build pack; they harden future implementation PRs.
