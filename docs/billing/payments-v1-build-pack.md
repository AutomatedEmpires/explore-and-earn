# Payments V1 Build Pack — Explore&Earn

> **DRAFT — DO NOT MERGE.** Architecture-only. No live Stripe billing, no live keys, no live products/prices, no production webhooks, no payment flows in the app. Founder approval is required before any of the gated items in `billing-approval-gates.md`.

## Purpose

This build pack prepares Explore&Earn payments, monetization, and entitlements for future implementation by VS Code / Copilot / Codex agents. It does **not** implement billing. It captures canon, defines type-only contracts, and sets safety gates so a later implementation PR can proceed deterministically.

## Operating model

| Layer | Source of truth |
| --- | --- |
| Pricing / monetization / entitlement / refund / product canon | **Notion** |
| Implementation truth | **GitHub** |
| Billing truth | **Stripe** |
| Local verifier | **VS Code / Copilot** |
| Architect / draft author | **Opus** |

**Critical rule:** If pricing docs conflict with ADRs or Founder Locked Pricing, **Founder Locked Pricing and ADRs win.** Old plan names/prices are marked *superseded*. Never refer to a product by a bare price string (e.g. “the $250 product”) — always use SKU labels.

## Source of truth (Notion canon read for this pack)

- Founder Locked Pricing (ADR-028) — host plan amounts & intervals
- Stripe SKU Catalog — product/price/coupon conventional names
- Pricing Details & Add-Ons — add-on amounts and rules
- Founding Host Program (ADR-030, ADR-034, ADR-035) — founding coupons & seat cap
- Refund Policy + Refund Mechanics / Edge Cases (ADR-015, ADR-033)
- Missing Entity Specs / RefundReview; Field-Level Billing Dictionary; Canonical Enum Registry
- Route-Level API Contracts (route namespace `/api/v1`)
- Open Questions & Decision Log (Locked Decisions: invite credits roll over; Starter views buckets, 0 invites)
- CI Guardrails G1–G30; Repo Scaffold & Monorepo Layout

## Document index

| Doc | Scope |
| --- | --- |
| `pricing-canon-v1.md` | Host plans, intervals, add-ons, founding program (canon mirror) |
| `stripe-product-map-v1.md` | Conventional Stripe product/price/coupon keys + metadata |
| `entitlements-v1.md` | Entitlement keys, grants, consumption, reset/rollover rules |
| `invite-packs-v1.md` | Invite credit packs (non-refundable, roll over) |
| `boosts-featured-v1.md` | Boost + featured-employer visibility products + ethics/caps/labeling |
| `webhook-strategy-v1.md` | Stripe webhook events, idempotency, retries, security |
| `refund-review-v1.md` | Refund-review boundary, state machine, outcomes, service credit |
| `dunning-and-lifecycle-v1.md` | Subscription lifecycle + dunning state machine |
| `billing-approval-gates.md` | Founder approval gate matrix (trigger/evidence/reversibility) |
| `proposed-guardrails-billing-v1.md` | Concrete CI guardrail proposals (G-series + G-BILL-*) |
| `tax-legal-considerations-v1.md` | Tax/legal/terms deferral + gate P-TAX |
| `billing-event-taxonomy-v1.md` | Analytics + internal billing event taxonomy |
| `sequence-flows-v1.md` | Sequence diagrams (checkout, founding race, add-ons, refund, idempotency) |
| `data-mirror-erd-v1.md` | Conceptual ERD + column model for mirror tables |
| `rls-billing-policy-v1.md` | Row-level security intent per billing table |
| `implementation-sequencing-v1.md` | Phased rollout plan + gates |
| `test-plan-v1.md` | Guardrail → assertion verification matrix |
| `../architecture/billing-service-boundaries.md` | Service/route boundaries & import rules |

## Contracts (type-only, `packages/contracts/src/`)

`billing.ts`, `entitlements.ts`, `stripe.ts`, `refund-review.ts`, `billing-routes.ts` (canon `/api/v1` route descriptors + payload shapes), `billing-events.ts` (analytics + internal event names/payloads) — additive re-export in `index.ts`. Existing `pricing.ts` is intentionally unchanged (see Q-BILL-1).

## Stripe seed (`packages/stripe-seed/`)

`catalog.ts` (conventional keys, no amounts), `safety.ts` (live-mode hard stop), `dry-run.ts` (plan builder), `manifest.ts` (deterministic hash for drift), `reconcile.ts` (pure mirror-vs-catalog diff), `index.ts` (barrel). Test-mode only; dry-run first; no secrets; no auto-execution in CI.

## Reconciliations applied in this pack

- **Route namespace:** billing routes use canon `/api/v1/billing/checkout`, `/api/v1/billing/webhook`, `/api/v1/host/billing` (not the earlier `/api/stripe/webhook`).
- **Invite credits roll over** (Locked Decision): ledger balance that never resets/expires; corrected in `entitlements-v1.md`, `invite-packs-v1.md`, `dunning-and-lifecycle-v1.md`.
- **Starter** gets `match.view_buckets` with 0 included invite credits (Locked Decision).

## What is V1 vs later

**V1 (modeled now, implemented later behind gates):** 3 host plans monthly+annual; founding-host coupons; add-ons (additional listing, boost 7/14/28d, featured employer 7/14/28d, community announcement, invite packs 5/10/25, team seat); entitlement model; Stripe seed (test-mode dry-run); webhook handlers; refund-review service; billing data mirror tables.

**Later / deferred:** live checkout, billing portal, production webhook deployment, refund automation beyond manual approval, tax/legal terms, PostHog SDK wiring, matched-candidate visibility product.

## What was intentionally NOT implemented

- No Stripe SDK imports anywhere in this pack.
- No live or test API calls; seed files are placeholders with a live-mode hard stop.
- No DB migrations; mirror tables are described conceptually only.
- No API route handlers; routes are described/typed, not coded.
- No price amounts added to new contract files — amounts stay in `packages/contracts/src/pricing.ts` (canon) per guardrail G1.

## Open questions (founder-gated)

- **Q-BILL-1 (drift):** `pricing.ts` stores amounts in **dollars**, but G1/G23 expect **integer cents**. Normalize in one ADR-aligned change with founder approval (Gate P-UNIT). The G1 cents test fails until resolved.
- **Q-BILL-2:** confirm exact `CampaignStatus` / `CampaignDeliveryStatus` enum values (`TODO(?)`).
- **Q-BILL-3:** confirm authoritative billing entity field lists vs the Field-Level Billing Dictionary (`TODO(?)`).

## Acceptance criteria status

See PR description. All 16 criteria are satisfied as architecture-only deliverables; items 12–14 (no live logic, no secrets, all uncertain values `TODO(?)`) are enforced by the rules above.
