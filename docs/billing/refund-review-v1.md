# Refund Review Boundary V1

> **DRAFT.** No auto-refunds. Only the `services/refund-review/` service may call `stripe.refunds.create` (ADR-015, G5). All other code is forbidden from initiating refunds.

## What can be reviewed

Refundable purchases: subscriptions (pro-rated per policy), `addon_additional_listing`, boosts/featured/announcements per policy. **Non-refundable:** invite-credit purchases → auto-reject `403 non_refundable_product`.

## State machine

`opened → under_review → approved → (processed | service_credit_issued)` with terminal `denied`, `cancelled`, `failed`.

- `RefundOutcomeType`: `stripe_refund`, `service_credit`, `denied`, `cancelled`.
- `RefundReasonCode`: `duplicate_charge`, `billing_error`, `unused_service`, `platform_error`, `moderation_action`, `goodwill`, `fraud_denied`, `other`.

## Evidence required

Charge / invoice reference, reason code, host statement, and any moderation/platform-error context. Worker `processApprovedRefundReviews()` executes only **approved** reviews.

## Who approves / automation boundary

- Approval is **manual** (admin/founder role) in V1.
- Automated: intake, validation, non-refundable rejection, reconciliation against `charge.refunded`.
- Manual-only: the approval decision and any `stripe.refunds.create` call.
- Founder approval required to enable any refund **automation** beyond manual.

## Stripe-side vs app-side

- Stripe-side: the actual refund (only via refund-review service).
- App-side: review records, audit log (G15), entitlement reversal where applicable, service-credit ledger.

## Service credit (ADR-033, LOCKED)

- FIFO, oldest-first; auto-applied to next invoice, capped at invoice total; **no cash-out**.
- Expires 12 months (`service_credit_ledger.expires_at`); emit `service_credit_expired` (G29).

## Audit

Every state transition and refund action is audit-logged in the same transaction (G15).

## Not implemented

No refund execution, no Stripe calls, no automation. Manual-review boundary only.
