# Billing Service Boundaries

> **DRAFT.** Defines where billing logic may live and the import rules between domains. No route handlers are implemented in this pack.

## Services & routes

| Path | Purpose | Auth | Role | Founder gate | Deferred |
| --- | --- | --- | --- | --- | --- |
| `apps/web/services/stripe/` | Stripe client wrapper, object-map lookups, checkout/portal session builders | server-only | host (self) | P-LIVEKEY, P-CHECKOUT, P-PORTAL | live calls |
| `apps/web/services/refund-review/` | **Sole** holder of `stripe.refunds.create` (G5) | server-only | admin/founder | P-REFUND | automation |
| `apps/web/app/api/billing/` | host-facing billing reads/mutations (plan, add-ons, entitlements) | required | host | P-CHECKOUT | mutations until gated |
| `apps/web/app/api/stripe/webhook/` | inbound Stripe webhooks | signature-verified, public path but server-validated | n/a | P-WEBHOOK | live deploy |

## Import / boundary rules (CI-enforced)

- `services/matching` may **not** import pricing / entitlements / boost / featured (G8).
- Every mutation route calls server-side `requireEntitlement(...)` (G14).
- Billing/moderation mutations write an audit log entry in the same transaction (G15).
- No `STRIPE_SECRET_KEY` client-side; no billing code in public (non-server) routes.
- No pricing literals outside `pricing.ts` / catalog (G1); boost/team-seat constants in cents (G23).
- Risky surfaces default-off behind a flag (G20).

## Customer model

One Stripe Customer per `users.id`; mirror `host_profiles.stripe_customer_id`; one active subscription per host; upgrades use `proration_behavior='create_prorations'`; add-ons billed immediately via invoice items.

## Data mirror tables (conceptual, later)

`stripe_customers`, `subscriptions`, `subscription_items`, `invoices`, `payments`, `entitlements`, `entitlement_grants`, `usage_counters`, `invite_credit_ledger`, `invite_pack_purchases`, `boost_purchases`, `refund_reviews`, `service_credit_ledger`, `stripe_object_map`, `stripe_webhook_events`, `billing_events`, `dispute_cases`. No migrations in this pack.

## Seed & reconciliation

`packages/stripe-seed` is idempotent, test-mode, dry-run-first, with a live-mode hard stop. Nightly `reconcileStripe()` diffs Stripe vs mirror → `admin_alerts`. See `packages/stripe-seed/README.md`.
