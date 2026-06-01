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
- Missing Entity Specs / RefundReview
- Field-Level Billing Dictionary
- Canonical Enum Registry
- CI Guardrails G1–G30
- Repo Scaffold & Monorepo Layout

## Document index

| Doc | Scope |
| --- | --- |
| `pricing-canon-v1.md` | Host plans, intervals, add-ons, founding program (canon mirror) |
| `stripe-product-map-v1.md` | Conventional Stripe product/price/coupon keys + metadata |
| `entitlements-v1.md` | Entitlement keys, grants, consumption, reset rules |
| `invite-packs-v1.md` | Invite credit packs (non-refundable) |
| `boosts-featured-v1.md` | Boost + featured-employer visibility products + ethics constraints |
| `webhook-strategy-v1.md` | Stripe webhook events, idempotency, retries, security |
| `refund-review-v1.md` | Refund-review boundary, outcomes, service credit |
| `billing-approval-gates.md` | Founder approval gate matrix |
| `billing-event-taxonomy-v1.md` | Analytics + internal billing event taxonomy |
| `../architecture/billing-service-boundaries.md` | Service/route boundaries & import rules |

## What is V1 vs later

**V1 (modeled now, implemented later behind gates):** 3 host plans (Starter/Professional/Enterprise) monthly+annual; founding-host coupons; add-ons (additional listing, boost 7/14/28d, featured employer 7/14/28d, community announcement, invite packs 5/10/25, team seat); entitlement model; Stripe seed (test-mode dry-run); webhook handlers; refund-review service; billing data mirror tables.

**Later / deferred:** live checkout, billing portal, production webhook deployment, refund automation beyond manual approval, tax/legal terms, PostHog SDK wiring.

## What was intentionally NOT implemented

- No Stripe SDK imports anywhere in this pack.
- No live or test API calls; seed files are placeholders with a live-mode hard stop.
- No DB migrations; mirror tables are described conceptually only.
- No API route handlers; routes are described, not coded.
- No price amounts added to new contract files — amounts stay in `packages/contracts/src/pricing.ts` (canon) per guardrail G1.

## Open questions (escalate to founder)

- **Q-BILL-1 (drift, founder-gated):** `packages/contracts/src/pricing.ts` currently stores `FOUNDER_LOCKED_PRICING` in **dollars** (e.g. `starter.monthly = 199`), but guardrail **G1** unit tests and **G23** expect **integer cents** (e.g. `19900`; add-on/boost/team-seat constants in cents). This is a real repo↑canon drift. **Do not silently flip it.** Normalizing to integer cents must be one deliberate ADR-aligned change with founder approval. See `billing-approval-gates.md` → Gate P-UNIT.
- **Q-BILL-2:** Exact `CampaignStatus` / `CampaignDeliveryStatus` enum member values must be re-confirmed against the Canonical Enum Registry before contracts are finalized (marked `TODO(?)` in `stripe.ts`/`billing.ts`).
- **Q-BILL-3:** Authoritative field lists for billing entities live in the Field-Level Billing Dictionary; entity interfaces here include `TODO(?)` markers where fields were not fully transcribed.

## Acceptance criteria status

See PR description. All 16 criteria are satisfied as architecture-only deliverables; items 12–14 (no live logic, no secrets, all uncertain values `TODO(?)`) are enforced by the rules above.
