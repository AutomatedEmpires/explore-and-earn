# Stripe Product Map V1

> **DRAFT.** Conventional (placeholder) Stripe object keys only. **No live products/prices/coupons are created by this pack.** Real Stripe IDs are resolved at seed time and stored in `stripe_object_map(conventional_name, stripe_id, livemode)`.

## Mapping strategy

- **One Stripe product per logical entitlement** (one product per plan tier; one product per add-on type/duration).
- Each plan product has **two prices**: `price_plan_{tier}_{monthly|annual}`.
- App code never hardcodes Stripe IDs; it looks them up by conventional name via `stripe_object_map`.
- Amounts are owned by `pricing.ts` canon, **not** by this map. (G1)

## Products & prices

| Conventional product key | Prices | Maps to |
| --- | --- | --- |
| `product_plan_starter` | `price_plan_starter_monthly`, `price_plan_starter_annual` | Starter plan |
| `product_plan_professional` | `price_plan_professional_monthly`, `price_plan_professional_annual` | Professional plan |
| `product_plan_enterprise` | `price_plan_enterprise_monthly`, `price_plan_enterprise_annual` | Enterprise plan |
| `product_addon_additional_listing` | `price_addon_additional_listing_monthly` | additional listing |
| `product_addon_boost` | `price_addon_boost_7d`, `_14d`, `_28d` | listing boost |
| `product_addon_featured_employer` | `price_addon_featured_employer_7d`, `_14d`, `_28d` | featured employer |
| `product_addon_community_announcement` | `price_addon_community_announcement` | announcement |
| `product_addon_invite_pack` | `price_addon_invite_pack_5`, `_10`, `_25` | invite packs |
| `product_addon_team_seat` | `price_addon_team_seat_monthly` | team seat |

## Coupons (founding host)

`coupon_founding_{starter|professional|enterprise}_{monthly|annual}` — 6 forever fixed-amount coupons. Server-side cap 100; Stripe `max_redemptions` 200 (safety ceiling only). See `pricing-canon-v1.md`.

## Required Stripe metadata (entitlement mapping)

Every product/price carries metadata so webhooks can grant entitlements without hardcoding:

- `ee_sku` — conventional SKU key (e.g. `plan_professional_monthly`).
- `ee_object_type` — one of `PurchaseObjectType`.
- `ee_entitlements` — comma-separated entitlement keys granted.
- `ee_plan_tier` — `PlanTier` for plan products (else empty).
- `ee_surface` — for boost/featured: `listing` or `host` (never both; G21).
- `ee_audience` — must be `host`; **never** `seeker` (G4).
- `ee_livemode_guard` — `test` for all seed-created objects in this pack.

## Object map table

`stripe_object_map(conventional_name TEXT, stripe_id TEXT, livemode BOOLEAN, created_at, updated_at)` — unique on `(conventional_name, livemode)`.

## Not implemented

- No live product/price/coupon creation.
- No real Stripe IDs (resolved at seed time, founder-gated for live mode).
