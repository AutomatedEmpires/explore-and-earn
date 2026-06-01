# Billing Event Taxonomy V1

> **DRAFT.** Two layers: (1) **analytics events** (PostHog later — no SDK wiring here) and (2) **internal `billing_events`** mirror rows. No tracking SDK is implemented in this pack.

## Analytics events (PostHog, later)

| Event | Trigger | Key properties |
| --- | --- | --- |
| `pricing_page_viewed` | host views pricing | tier_shown, source |
| `plan_selected` | host picks a plan | plan_tier, interval |
| `checkout_started` | checkout opened | sku, amount_source=canon |
| `checkout_completed` | checkout success | sku, subscription_id |
| `checkout_abandoned` | checkout dropped | sku, step |
| `subscription_created` | sub active | plan_tier, founding(bool) |
| `subscription_cancelled` | sub cancelled | plan_tier, reason |
| `invoice_failed` | payment failed | invoice_id, attempt |
| `invite_pack_purchased` | invite pack bought | pack_key, quantity |
| `boost_purchased` | boost bought | boost_key, surface=listing |
| `featured_purchased` | featured bought | featured_key, surface=host |
| `refund_requested` | review opened | object_type, reason_code |
| `refund_reviewed` | review decided | outcome_type |

Rules: no PII beyond IDs; no seeker monetization events (G4); amounts referenced by SKU, never hardcoded.

## Internal `billing_events` mirror

`billing_events(id, event_type, actor_id, object_type PurchaseObjectType, object_id, payload jsonb, created_at)` — conceptual only, no migration here. Source of truth for billing-side auditing alongside the audit log (G15).

## Not implemented

No SDK init, no event emission, no migration. Wiring is deferred and gated.
