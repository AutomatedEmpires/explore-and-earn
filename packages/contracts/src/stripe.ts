/**
 * Stripe mapping contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Source of truth: Stripe SKU Catalog (Notion). RULES: NO Stripe SDK import,
 * NO live calls, NO secrets, NO price amounts. Conventional (placeholder) keys
 * only; real Stripe IDs are resolved at seed time into stripe_object_map.
 */

import type {
	AddOnType,
	BillingInterval,
	PlanTier,
	PurchaseObjectType,
} from "./billing"
import type { EntitlementKey } from "./entitlements"

/** Webhook event types this app intends to handle. See docs/billing/webhook-strategy-v1.md. */
export const STRIPE_WEBHOOK_EVENTS = [
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"invoice.paid",
	"invoice.payment_succeeded",
	"invoice.payment_failed",
	"payment_intent.succeeded",
	"charge.refunded",
	"charge.dispute.created",
	"customer.created",
	"customer.updated",
] as const
export type StripeWebhookEventType = (typeof STRIPE_WEBHOOK_EVENTS)[number]

/** Conventional Stripe PRODUCT keys (one product per logical entitlement). */
export const STRIPE_PRODUCT_KEYS = [
	"product_plan_starter",
	"product_plan_professional",
	"product_plan_enterprise",
	"product_addon_additional_listing",
	"product_addon_boost",
	"product_addon_featured_employer",
	"product_addon_community_announcement",
	"product_addon_invite_pack",
	"product_addon_team_seat",
] as const
export type StripeProductKey = (typeof STRIPE_PRODUCT_KEYS)[number]

/** Conventional Stripe PRICE keys (no amounts here — amounts live in ./pricing.ts). */
export const STRIPE_PRICE_KEYS = [
	"price_plan_starter_monthly",
	"price_plan_starter_annual",
	"price_plan_professional_monthly",
	"price_plan_professional_annual",
	"price_plan_enterprise_monthly",
	"price_plan_enterprise_annual",
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
export type StripePriceKey = (typeof STRIPE_PRICE_KEYS)[number]

/** Forever fixed-amount founding-host coupons (ADR-030). Amounts in ./pricing.ts canon. */
export const STRIPE_COUPON_KEYS = [
	"coupon_founding_starter_monthly",
	"coupon_founding_starter_annual",
	"coupon_founding_professional_monthly",
	"coupon_founding_professional_annual",
	"coupon_founding_enterprise_monthly",
	"coupon_founding_enterprise_annual",
] as const
export type StripeCouponKey = (typeof STRIPE_COUPON_KEYS)[number]

/** Metadata each Stripe object must carry so webhooks grant entitlements without hardcoding. */
export interface StripeObjectMetadata {
	ee_sku: string
	ee_object_type: PurchaseObjectType
	ee_entitlements: ReadonlyArray<EntitlementKey>
	ee_plan_tier: PlanTier | null
	ee_surface: "listing" | "host" | null
	// Audience must always be host; seeker is forbidden (G4).
	ee_audience: "host"
	// All objects created by the seed in this pack are test-mode.
	ee_livemode_guard: "test" | "live"
}

/** Row of the stripe_object_map mirror (conventional_name -> resolved Stripe id). */
export interface StripeObjectMapRow {
	conventionalName:
		| StripeProductKey
		| StripePriceKey
		| StripeCouponKey
	stripeId: string
	livemode: boolean
	createdAt: string
	updatedAt: string
}

/** Result returned by a webhook handler dispatch (for logging + idempotency). */
export interface WebhookHandlerResult {
	eventId: string
	eventType: StripeWebhookEventType
	handled: boolean
	noOp: boolean
	note?: string
}

/** Helper shape only; not executed here. */
export interface PlanPriceRef {
	planTier: Exclude<PlanTier, "none">
	interval: BillingInterval
	priceKey: StripePriceKey
	productKey: StripeProductKey
}

/** Helper shape only; not executed here. */
export interface AddOnPriceRef {
	addOnType: AddOnType
	priceKey: StripePriceKey
	productKey: StripeProductKey
}
