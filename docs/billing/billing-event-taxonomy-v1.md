# Billing Event Taxonomy V1

> **DRAFT.** Two layers: (1) **analytics events** (PostHog later — no SDK wiring here) and (2) **internal `billing_events`** mirror rows. Both are typed in `packages/contracts/src/billing-events.ts`. No tracking SDK is implemented in this pack.

## Layer 1 — Analytics events (PostHog, later)

| Event | Trigger | Key properties (typed) |
| --- | --- | --- |
| `pricing_page_viewed` | host views pricing | `tierShown`, `source` |
| `plan_selected` | host picks a plan | `planTier`, `interval` |
| `checkout_started` | checkout opened | `sku`, `interval?`, `foundingCouponKey?` |
| `checkout_completed` | checkout success | `sku`, `subscriptionId` |
| `checkout_abandoned` | checkout dropped | `sku`, `step` |
| `subscription_created` | sub active | `planTier`, `interval`, `founding` |
| `subscription_cancelled` | sub cancelled | `planTier`, `reason` |
| `invoice_failed` | payment failed | `invoiceId`, `attempt` |
| `invite_pack_purchased` | invite pack bought | `packKey`, `quantity` |
| `boost_purchased` | boost bought | `boostKey`, `surface=listing`, `durationDays` |
| `featured_purchased` | featured bought | `featuredKey`, `surface=host`, `durationDays` |
| `refund_requested` | review opened | `objectType`, `reasonCode` |
| `refund_reviewed` | review decided | `outcomeType` |

Rules: no PII beyond IDs; **no seeker monetization events** (G4); amounts referenced by SKU, never hardcoded (G1). Property shapes live in `BillingAnalyticsPayload` (discriminated union).

## Layer 2 — Internal `billing_events`

Typed as `InternalBillingEvent`. These are server-emitted audit-stream rows (distinct from the analytics layer):

`subscription.activated`, `subscription.updated`, `subscription.cancelled`, `founding.seat_granted`, `founding.cap_race_downgraded`, `addon.purchased`, `boost.started`, `boost.ended`, `featured.started`, `featured.ended`, `invite_credit.granted`, `invite_credit.consumed`, `announcement.granted`, `refund.opened`, `refund.approved`, `refund.processed`, `service_credit.issued`, `service_credit.applied`, `service_credit.expired`, `dispute.opened`.

Stored as `billing_events(id, event_type, actor_id, object_type PurchaseObjectType, object_id, payload jsonb, created_at)` — conceptual only, no migration here. This is the billing-side audit source alongside the global audit log (G15).

## Not implemented

No SDK init, no event emission, no migration. Wiring is deferred and gated.
