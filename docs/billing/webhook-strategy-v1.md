# Webhook Strategy V1

> **DRAFT.** No production webhook is deployed by this pack. The handler lands at canon route **`POST /api/v1/billing/webhook`** (App Router file `apps/web/app/api/v1/billing/webhook/route.ts`). Every handler verifies the Stripe signature, is idempotent on `event.id`, and writes to `stripe_webhook_events(event_id PK, type, processed_at, ...)`.

## Idempotency pattern (G17)

1. Verify signature (`stripe-signature` header + webhook secret). Reject unverified (`webhook_signature_invalid`).
2. `INSERT stripe_webhook_events(event_id) ON CONFLICT (event_id) DO NOTHING`.
3. If row already processed (`processed_at` set), return 200 without re-dispatch (`StripeWebhookAck.duplicate = true`).
4. Dispatch handler inside a transaction; on success set `processed_at`.
5. Audit-log billing state changes in the same transaction (G15).

## Events

| Event | Why it matters | App state updated | Idempotency key | Notes / what NOT to do yet |
| --- | --- | --- | --- | --- |
| `checkout.session.completed` | activate subscription / record purchase | create `Subscription`, apply founding coupon if seat available, increment founding seat | `event.id` | do not grant metered entitlements before `invoice.payment_succeeded` |
| `customer.subscription.created` | mirror sub | upsert `Subscription` | `event.id` | |
| `customer.subscription.updated` | plan/seat/status change | update tier, status, items; founding tier swap (ADR-034) | `event.id` | never decrement founding seat (G24) |
| `customer.subscription.deleted` | cancellation | status → cancelled; forfeit founding rate; do not free seat | `event.id` | |
| `invoice.paid` / `invoice.payment_succeeded` | grant included entitlements | reset/grant cycle entitlements + announcements; add rolling invite credits | `event.id` | invite credits roll over (do not reset) |
| `invoice.payment_failed` | dunning | status → past_due | `event.id` | do not auto-cancel |
| `payment_intent.succeeded` | one-time add-ons | record `AddOnPurchase`; create boost/featured campaign or add invite credits | `event.id` | |
| `charge.refunded` | refund reconcile | match `refund_reviews.stripe_refund_id`; else open a review | `event.id` | never auto-issue refunds here (G5) |
| `charge.dispute.created` | disputes | open `DisputeCase` (high priority) | `event.id` | |
| `customer.created` / `customer.updated` | customer mirror | upsert `stripe_customers` / `host_profiles.stripe_customer_id` | `event.id` | |

## Retry behavior

Return 2xx only after successful processing; return 5xx to let Stripe retry. Idempotency makes retries safe. Dead-letter after Stripe's retry window → `admin_alerts` (`TODO(?)` confirm alert table).

## Security

- Signature verification mandatory; reject on failure.
- Webhook secret from env, never committed. Webhook authenticates by signature, not by user scope (see `BillingRouteAuth` in `contracts/src/billing-routes.ts`).
- Endpoint logic is server-only; no billing code in public (non-server) routes.

## Not implemented yet

No live endpoint registration, no production secret, no live dispatch. Founder gate **P-WEBHOOK** required to deploy.
