/**
 * Founder-locked pricing — Explore&Earn Payments V1.
 *
 * SINGLE SOURCE OF TRUTH for all billing AMOUNTS (guardrail G1). Every monetary
 * value here is an INTEGER number of USD CENTS. No price literals may live in
 * any other file (contracts, seed, app, or SQL).
 *
 * Canon:
 *  - Founder Locked Pricing — Canonical Host Plans (ADR-028)
 *  - Pricing Details, Add-Ons & Host Self-Preview Rules
 *  - Stripe Coupon & SKU Catalog — V1 (ADR-030 / 031 / 032 / 033 / 034)
 *
 * Q-BILL-1 / Gate P-UNIT — RESOLVED (founder-approved 2026-05-31): amounts
 * normalized from the founder-locked DOLLAR canon to integer cents (x100).
 * Annual = exactly 10x monthly ("2 months free"; never "save 17%").
 * Verified by tools/scripts/check-pricing-units.mjs.
 */

export const CURRENCY = "usd" as const

/**
 * Host subscription plans, in integer USD cents. Keys mirror PlanTier
 * (excluding "none"). Annual ("yearly") = 10x monthly (ADR-028).
 */
export const FOUNDER_LOCKED_PRICING = {
	starter: {
		monthly: 19900,
		yearly: 199000,
	},
	professional: {
		monthly: 39900,
		yearly: 399000,
	},
	enterprise: {
		monthly: 74900,
		yearly: 749000,
	},
} as const

export type PricedPlanTier = keyof typeof FOUNDER_LOCKED_PRICING
export type PlanIntervalKey = "monthly" | "yearly"

/**
 * Founding Host fixed-amount discounts (ADR-030), in integer USD cents OFF the
 * locked plan price. Implemented as forever-duration Stripe coupons; net price
 * = plan price - discount. Shared 100-seat cap enforced server-side.
 * Net effect: Starter 14900/149000, Professional 29900/299000,
 * Enterprise 59900/599000.
 */
export const FOUNDING_DISCOUNT_CENTS = {
	starter: {
		monthlyOff: 5000,
		yearlyOff: 50000,
	},
	professional: {
		monthlyOff: 10000,
		yearlyOff: 100000,
	},
	enterprise: {
		monthlyOff: 15000,
		yearlyOff: 150000,
	},
} as const

/**
 * One-time and recurring add-on amounts, in integer USD cents. Keys mirror the
 * conventional Stripe price keys (without the "price_addon_" prefix) so the
 * seed can map SKU -> amount. Canon: Pricing Details + SKU Catalog
 * (ADR-031 boosts/featured; ADR-032 team seat).
 */
export const ADDON_PRICING_CENTS = {
	additional_listing_monthly: 10000,
	boost_7d: 20000,
	boost_14d: 35000,
	boost_28d: 50000,
	featured_employer_7d: 20000,
	featured_employer_14d: 35000,
	featured_employer_28d: 50000,
	community_announcement: 15000,
	invite_pack_5: 25000,
	invite_pack_10: 40000,
	invite_pack_25: 75000,
	team_seat_monthly: 4900,
} as const

/** Invite credits granted per purchased pack (Founder Locked Pricing). */
export const INVITE_PACK_CREDITS = {
	invite_pack_5: 5,
	invite_pack_10: 10,
	invite_pack_25: 25,
} as const

/** Boost exposure durations in days (ADR-031). */
export const BOOST_DURATION_DAYS = {
	boost_7d: 7,
	boost_14d: 14,
	boost_28d: 28,
} as const

/** Featured Employer exposure durations in days (ADR-031). */
export const FEATURED_EMPLOYER_DURATION_DAYS = {
	featured_employer_7d: 7,
	featured_employer_14d: 14,
	featured_employer_28d: 28,
} as const

/** Community announcement active window, in days (Pricing Details). */
export const COMMUNITY_ANNOUNCEMENT_ACTIVE_DAYS = 15

/**
 * Plan-included entitlement quantities (Founder Locked Pricing + Pricing
 * Details). Counts only — capability SHAPE lives in ./entitlements.ts.
 */
export const PLAN_ENTITLEMENT_LIMITS = {
	starter: {
		listings: 1,
		includedInviteCredits: 0,
		includedAnnouncementsPerMonth: 0,
		teamSeats: 0,
	},
	professional: {
		listings: 5,
		includedInviteCredits: 5,
		includedAnnouncementsPerMonth: 1,
		teamSeats: 0,
	},
	enterprise: {
		listings: 10,
		includedInviteCredits: 10,
		includedAnnouncementsPerMonth: 3,
		teamSeats: 1,
	},
} as const

/** Founding Host program limits (ADR-030). */
export const FOUNDING_SEAT_CAP = 100
export const FOUNDING_COUPON_MAX_REDEMPTIONS_CEILING = 200

/** Service-credit expiry, in months from issuance (ADR-033). */
export const SERVICE_CREDIT_EXPIRY_MONTHS = 12

/** Refundability flags by add-on family (ADR-015 / Refund Policy). */
export const ADDITIONAL_LISTING_REFUNDABLE = true
export const INVITE_CREDITS_REFUNDABLE = false
