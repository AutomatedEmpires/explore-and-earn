# Invite Packs V1

> **DRAFT.** Invite packs are one-time purchases of candidate-outreach credits. They are **NOT** subscription plans and must never be conflated with them.

## Packs (Pricing Details & Add-Ons)

| Pack key | Display | Price | Quantity | Refundable | Stripe product | Stripe price | Entitlement granted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `addon_invite_pack_5` | 5 Invite Credits | $250 | 5 | **No** | `product_addon_invite_pack` | `price_addon_invite_pack_5` | `invite.credit` +5 |
| `addon_invite_pack_10` | 10 Invite Credits | $400 | 10 | **No** | `product_addon_invite_pack` | `price_addon_invite_pack_10` | `invite.credit` +10 |
| `addon_invite_pack_25` | 25 Invite Credits | $750 | 25 | **No** | `product_addon_invite_pack` | `price_addon_invite_pack_25` | `invite.credit` +25 |

Plan-included credits (Pro 5, Ent 10) are separate from purchased packs.

## Expiration

Purchased invite credits do not expire in V1 unless canon states otherwise. `TODO(?)` confirm expiry policy in Refund/Pricing canon.

## Refundability

**Non-refundable.** A refund-review on an invite-credit purchase must be rejected: `refund_reviews` INSERT with `related_object_type = 'invite_credit_purchase'` → `403 non_refundable_product`. (See `refund-review-v1.md`.)

## Usage decrement

- Credits live in `InviteCreditLedger`.
- Decrement **only** on a successful candidate invite send (idempotent per invite).
- Never decrement on draft/abandoned invites.

## Abuse / anti-spam guardrails

- Rate-limit invite sends per host per window (`TODO(?)` exact thresholds in canon).
- Block invites to candidates who opted out / blocked the host.
- Audit log every credit grant and consumption (G15).
- Invites must never imply guaranteed match quality (G8).

## Founder gate

Pack pricing, quantities, and refundability are founder-locked.
