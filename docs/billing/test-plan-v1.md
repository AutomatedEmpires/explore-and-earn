# Payments V1 Verification Matrix (for VS Code / Copilot)

> **DRAFT.** What a local verifier must check. Maps each CI guardrail to an assertion. The G1 cents test is expected to **fail** until Q-BILL-1 is resolved — that failure is the signal, not a regression.

## Commands

```bash
pnpm install
pnpm lint            # incl. no-pricing-literals rule (G1) + boundary lint (G8)
pnpm typecheck       # new contracts compile; no Stripe SDK imports
pnpm test            # unit (G1/G23 pricing-cents) — fails until Q-BILL-1 fixed
pnpm -w db:assert    # later (P2): mirror schema assertions
pnpm -w rls:test     # later (P2): RLS policy tests
pnpm -w e2e:guardrails
```

## Guardrail → assertion

| Guardrail | Assertion |
| --- | --- |
| G1 | No pricing literals outside `pricing.ts` / catalog; amounts in integer cents (currently failing — Q-BILL-1) |
| G4 | No seeker paywall; no Stripe metadata `ee_audience='seeker'`; no billing table readable by seeker scope |
| G5 | `stripe.refunds.create` referenced only under `services/refund-review/` |
| G8 | `services/matching` does not import pricing/entitlements/boost/featured; boosts never alter `match_score` |
| G14 | Every billing mutation route calls `requireEntitlement` server-side |
| G15 | Billing/moderation mutations write an audit log row in the same transaction |
| G17 | Webhook handlers upsert `stripe_webhook_events(event_id)` and are idempotent |
| G20 | Risky surfaces (boost/featured/checkout) behind a default-off flag |
| G21 | No `featured_employer` as a default plan entitlement; boost ≠ featured (never bundled) |
| G23 | Boost/team-seat constants in cents (boost 20000/35000/50000; team seat 4900) |
| G24 | Founding seat integrity: server-side cap 100, never decremented; cap-race downgrades, never cancels |
| G29 | Service credit FIFO + 12-month expiry; emits `service_credit_expired` |

## Static checks specific to this pack

- No file under `packages/contracts/src/billing*.ts`, `entitlements.ts`, `stripe.ts`, `refund-review.ts` imports the Stripe SDK or contains a secret.
- `packages/stripe-seed/src/safety.ts` hard-stops on `sk_live_` and on `requestedMode === 'live-write'`.
- `run_secret_scanning` over changed files returns no findings.
