# Payments Implementation Sequencing V1

> **DRAFT.** Phased plan for the future implementation PRs. Each phase names its founder gate(s). Nothing in this pack advances past Phase 0.

## Dependency: resolve Q-BILL-1 first

Before any seed or checkout work, normalize `packages/contracts/src/pricing.ts` to **integer cents** (G1/G23) in one ADR-aligned, founder-approved change (gate **P-UNIT**). All downstream phases assume cents.

## Phases

| Phase | Scope | Gate(s) | Exit criteria |
| --- | --- | --- | --- |
| **P0 (this pack)** | Architecture, type-only contracts, seed placeholders, docs | none (no live anything) | PR #9 reviewed |
| **P1** | Pricing-unit normalization (Q-BILL-1) + finalize enums (Q-BILL-2) + entity fields (Q-BILL-3) | P-UNIT, P-PRICE, P-ENT | G1/G23 unit tests pass; contracts frozen |
| **P2** | DB mirror migrations + RLS (from ERD + RLS intent) | P-DEPLOY (staging) | `db:assert` + `rls:test` pass |
| **P3** | `packages/billing` service logic + thin `/api/v1/billing/*` + `/api/v1/host/billing` (no live keys) | — | typecheck + guardrail e2e pass in test mode |
| **P4** | Stripe **test-mode** seed (dry-run → manifest match → gated test-write) | P-PROD (test) | `expected-stripe-manifest.json` matches |
| **P5** | Webhook handler + refund-review service (test mode) | P-WEBHOOK, P-REFUND | idempotency + refund-path tests pass |
| **P6** | Live activation: keys, prod products/prices, checkout, portal, webhook deploy | P-LIVEKEY, P-PROD, P-CHECKOUT, P-PORTAL, P-WEBHOOK, P-TAX, P-DEPLOY | founder sign-off per gate |

## Hard ordering rules

- No checkout (P3) before contracts are frozen (P1).
- No test-write seed (P4) before dry-run manifest matches.
- No live mode (P6) until every prior phase is merged and every listed gate is approved.
- `services/refund-review` remains the only module permitted to call `stripe.refunds.create` (G5) in every phase.
