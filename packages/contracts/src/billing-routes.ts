/**
 * Billing route contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Aligned to canon route namespace /api/v1/{domain}/{action}
 * (Notion: "Route-Level API Contracts & TypeScript Contract Plan").
 * Canonical billing routes:
 *   POST /api/v1/billing/checkout
 *   POST /api/v1/billing/webhook
 *   GET  /api/v1/host/billing
 *
 * RULES: no Stripe SDK, no framework imports, no live calls, no secrets, no
 * price amounts. Payload DATA shapes only — these wrap in the shared
 * ApiResponse<T> envelope once that shared contract lands
 * (TODO(?): import ApiResponse / ApiError / RequestContext from a future ./api module).
 */

import type { BillingInterval, BillingStatus, PlanTier } from "./billing"
import type { EntitlementKey } from "./entitlements"
import type { StripePriceKey, StripeWebhookEventType } from "./stripe"

/** Billing-domain error codes (carried in the shared ApiError.code). */
export const BILLING_ERROR_CODES = [
	"entitlement_denied",
	"non_refundable_product",
	"plan_change_not_allowed",
	"founding_cap_reached",
	"invalid_sku",
	"duplicate_subscription",
	"webhook_signature_invalid",
	"idempotency_conflict",
	"live_mode_forbidden",
	"founder_gate_required",
] as const
export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number]

/**
 * Auth/role requirement for a billing route. activeScope / permissions /
 * entitlements come from the shared RequestContext at implementation time.
 */
export interface BillingRouteAuth {
	requiresAuth: boolean
	requiredScope: "host" | "admin" | "platform" | null
	// Webhooks authenticate via Stripe signature, not scope.
	signatureVerified?: boolean
	// Server-side entitlement check required before any mutation (G14).
	requiresEntitlement?: EntitlementKey
	// Blocked until founder approval (see docs/billing/billing-approval-gates.md).
	founderGated: boolean
}

/** POST /api/v1/billing/checkout — create a Stripe Checkout session (gated; no live calls in V1). */
export interface BillingCheckoutRequest {
	priceKey: StripePriceKey
	interval?: BillingInterval
	quantity?: number
	// Optional founding coupon conventional key; server validates seat availability (G24).
	foundingCouponKey?: string | null
	successPath: string
	cancelPath: string
}
export interface BillingCheckoutResponseData {
	// Conventional reference only; no real session is created in this pack.
	checkoutSessionRef: string
	// Null until checkout is activated (gate P-CHECKOUT).
	checkoutUrl: string | null
}

/** GET /api/v1/host/billing — entitlement + plan summary for the host dashboard strip. */
export interface HostBillingSummaryData {
	planTier: PlanTier
	interval: BillingInterval | null
	status: BillingStatus
	isFounding: boolean
	// Rolls over; never resets or expires (Locked Decision: "Invite credits roll over").
	inviteCreditsRemaining: number
	// Plan-included portion resets per billing cycle.
	includedAnnouncementsRemaining: number
	entitlements: Partial<Record<EntitlementKey, boolean | number>>
	expiringCampaigns: Array<{
		kind: "boost" | "featured"
		ref: string
		endsAt: string
	}>
}

/** POST /api/v1/billing/webhook — inbound Stripe webhook (signature-verified, idempotent on event.id). */
export interface StripeWebhookRequestMeta {
	eventId: string
	eventType: StripeWebhookEventType
	signatureVerified: boolean
}
export interface StripeWebhookAck {
	received: true
	eventId: string
	duplicate: boolean
}

export interface BillingRouteDescriptor {
	method: "GET" | "POST"
	path: string
	auth: BillingRouteAuth
	idempotent: boolean
	emits: ReadonlyArray<string>
}

/** Canonical billing route registry (descriptors only; no handlers implemented). */
export const BILLING_ROUTES = {
	checkout: {
		method: "POST",
		path: "/api/v1/billing/checkout",
		auth: {
			requiresAuth: true,
			requiredScope: "host",
			founderGated: true,
		},
		idempotent: false,
		emits: ["checkout_started"],
	},
	webhook: {
		method: "POST",
		path: "/api/v1/billing/webhook",
		auth: {
			requiresAuth: false,
			requiredScope: null,
			signatureVerified: true,
			founderGated: true,
		},
		idempotent: true,
		emits: [],
	},
	hostBilling: {
		method: "GET",
		path: "/api/v1/host/billing",
		auth: {
			requiresAuth: true,
			requiredScope: "host",
			founderGated: false,
		},
		idempotent: true,
		emits: [],
	},
} as const satisfies Record<string, BillingRouteDescriptor>
