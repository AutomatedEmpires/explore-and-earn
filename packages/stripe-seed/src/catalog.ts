/**
 * Conventional Stripe catalog (DRAFT placeholder, data-only).
 *
 * Lists the conventional product/price/coupon KEYS the seed will create in
 * TEST mode. Contains NO amounts (amounts live in packages/contracts/src/pricing.ts,
 * guardrail G1) and performs NO Stripe calls. Keys mirror packages/contracts/src/stripe.ts.
 */

export const PLAN_PRODUCTS = [
	"product_plan_starter",
	"product_plan_professional",
	"product_plan_enterprise",
] as const

export const ADDON_PRODUCTS = [
	"product_addon_additional_listing",
	"product_addon_boost",
	"product_addon_featured_employer",
	"product_addon_community_announcement",
	"product_addon_invite_pack",
	"product_addon_team_seat",
] as const

export const PLAN_PRICES = [
	"price_plan_starter_monthly",
	"price_plan_starter_annual",
	"price_plan_professional_monthly",
	"price_plan_professional_annual",
	"price_plan_enterprise_monthly",
	"price_plan_enterprise_annual",
] as const

export const ADDON_PRICES = [
	"price_addon_additional_listing_monthly",
	"price_addon_boost_7d",
	"price_addon_boost_14d",
	"price_addon_boost_28d",
	"price_addon_featured_employer_7d",
	"price_addon_featured_employer_14d",
	"price_addon_featured_employer_28d",
	"price_addon_community_announcement",
	"price_addon_invite_pack_5",
	"price_addon_invite_pack_10",
	"price_addon_invite_pack_25",
	"price_addon_team_seat_monthly",
] as const

export const FOUNDING_COUPONS = [
	"coupon_founding_starter_monthly",
	"coupon_founding_starter_annual",
	"coupon_founding_professional_monthly",
	"coupon_founding_professional_annual",
	"coupon_founding_enterprise_monthly",
	"coupon_founding_enterprise_annual",
] as const

// TODO(?): amounts intentionally absent. Seed reads integer-cent amounts from
// packages/contracts/src/pricing.ts once Q-BILL-1 (dollars->cents) is resolved.
export const CATALOG_KEYS = {
	planProducts: PLAN_PRODUCTS,
	addonProducts: ADDON_PRODUCTS,
	planPrices: PLAN_PRICES,
	addonPrices: ADDON_PRICES,
	foundingCoupons: FOUNDING_COUPONS,
} as const
