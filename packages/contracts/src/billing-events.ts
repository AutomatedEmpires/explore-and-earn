/**
 * Billing event contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Two layers: (1) analytics events (PostHog later) and (2) internal billing_events.
 * RULES: no SDK, no emission, no secrets, no logic. SHAPES only.
 * No seeker monetization events (G4). Amounts referenced by SKU, never embedded (G1).
 */

import type {
	AddOnType,
	BillingInterval,
	PlanTier,
	PurchaseObjectType,
} from "./billing"
import type { RefundOutcomeType, RefundReasonCode } from "./refund-review"

/** Client-facing analytics events (PostHog later). */
export const BILLING_ANALYTICS_EVENTS = [
	"pricing_page_viewed",
	"plan_selected",
	"checkout_started",
	"checkout_completed",
	"checkout_abandoned",
	"subscription_created",
	"subscription_cancelled",
	"invoice_failed",
	"invite_pack_purchased",
	"boost_purchased",
	"featured_purchased",
	"refund_requested",
	"refund_reviewed",
] as const
export type BillingAnalyticsEvent = (typeof BILLING_ANALYTICS_EVENTS)[number]

/** Internal billing_events mirror types (server-side audit stream). */
export const INTERNAL_BILLING_EVENTS = [
	"subscription.activated",
	"subscription.updated",
	"subscription.cancelled",
	"founding.seat_granted",
	"founding.cap_race_downgraded",
	"addon.purchased",
	"boost.started",
	"boost.ended",
	"featured.started",
	"featured.ended",
	"invite_credit.granted",
	"invite_credit.consumed",
	"announcement.granted",
	"refund.opened",
	"refund.approved",
	"refund.processed",
	"service_credit.issued",
	"service_credit.applied",
	"service_credit.expired",
	"dispute.opened",
] as const
export type InternalBillingEvent = (typeof INTERNAL_BILLING_EVENTS)[number]

/** Analytics property shapes (no PII beyond IDs; audience always host). */
export interface PricingPageViewedProps {
	tierShown: PlanTier | "all"
	source: string
}
export interface PlanSelectedProps {
	planTier: Exclude<PlanTier, "none">
	interval: BillingInterval
}
export interface CheckoutStartedProps {
	sku: string
	interval?: BillingInterval
	foundingCouponKey?: string | null
}
export interface CheckoutCompletedProps {
	sku: string
	subscriptionId: string | null
}
export interface CheckoutAbandonedProps {
	sku: string
	step: string
}
export interface SubscriptionCreatedProps {
	planTier: Exclude<PlanTier, "none">
	interval: BillingInterval
	founding: boolean
}
export interface SubscriptionCancelledProps {
	planTier: Exclude<PlanTier, "none">
	reason: string | null
}
export interface InvoiceFailedProps {
	invoiceId: string
	attempt: number
}
export interface InvitePackPurchasedProps {
	packKey: string
	quantity: number
}
export interface BoostPurchasedProps {
	boostKey: string
	surface: "listing"
	durationDays: number
}
export interface FeaturedPurchasedProps {
	featuredKey: string
	surface: "host"
	durationDays: number
}
export interface RefundRequestedProps {
	objectType: PurchaseObjectType | "invite_credit_purchase"
	reasonCode: RefundReasonCode
}
export interface RefundReviewedProps {
	outcomeType: RefundOutcomeType
}

/** Discriminated union mapping each analytics event to its property shape. */
export type BillingAnalyticsPayload =
	| { event: "pricing_page_viewed"; props: PricingPageViewedProps }
	| { event: "plan_selected"; props: PlanSelectedProps }
	| { event: "checkout_started"; props: CheckoutStartedProps }
	| { event: "checkout_completed"; props: CheckoutCompletedProps }
	| { event: "checkout_abandoned"; props: CheckoutAbandonedProps }
	| { event: "subscription_created"; props: SubscriptionCreatedProps }
	| { event: "subscription_cancelled"; props: SubscriptionCancelledProps }
	| { event: "invoice_failed"; props: InvoiceFailedProps }
	| { event: "invite_pack_purchased"; props: InvitePackPurchasedProps }
	| { event: "boost_purchased"; props: BoostPurchasedProps }
	| { event: "featured_purchased"; props: FeaturedPurchasedProps }
	| { event: "refund_requested"; props: RefundRequestedProps }
	| { event: "refund_reviewed"; props: RefundReviewedProps }

/** Keeps add-on analytics aligned with billing enums. */
export interface AddOnAnalyticsRef {
	addOnType: AddOnType
	sku: string
}
