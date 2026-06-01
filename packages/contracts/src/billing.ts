/**
 * Billing domain contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Source of truth (Notion canon):
 *  - Canonical Enum Registry (PlanTier, BillingStatus, PurchaseObjectType, surfaces)
 *  - Field-Level Billing Dictionary (entity field lists)
 *  - Founder Locked Pricing / ADR-028 (AMOUNTS live in ./pricing.ts, NOT here)
 *
 * RULES:
 *  - No Stripe SDK imports. No live calls. No secrets. No feature/runtime logic.
 *  - This file contains NO price amounts (guardrail G1). Amounts are owned by
 *    ./pricing.ts to avoid a second pricing source of truth.
 */

export const PLAN_TIERS = [
	"none",
	"starter",
	"professional",
	"enterprise",
] as const
export type PlanTier = (typeof PLAN_TIERS)[number]

export const BILLING_INTERVALS = ["monthly", "annual"] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

export const BILLING_STATUSES = [
	"none",
	"trialing",
	"active",
	"past_due",
	"cancelled",
	"unpaid",
	"paused",
] as const
export type BillingStatus = (typeof BILLING_STATUSES)[number]

export const PURCHASE_OBJECT_TYPES = [
	"subscription",
	"add_on",
	"boost",
	"featured",
	"announcement",
	"invite_credit",
	"team_seat",
	"additional_listing",
	"dispute_case",
	"other",
] as const
export type PurchaseObjectType = (typeof PURCHASE_OBJECT_TYPES)[number]

export const ADD_ON_TYPES = [
	"additional_listing",
	"boost",
	"featured_employer",
	"community_announcement",
	"invite_pack",
	"team_seat",
] as const
export type AddOnType = (typeof ADD_ON_TYPES)[number]

export const BOOST_PLACEMENT_SURFACES = [
	"seek",
	"swipe",
	"map_drawer",
	"map_pin",
	"community_feed",
	"homepage",
] as const
export type BoostPlacementSurface = (typeof BOOST_PLACEMENT_SURFACES)[number]

export const FEATURED_EMPLOYER_SURFACES = [
	"homepage",
	"seek_dashboard",
	"category_dashboard",
] as const
export type FeaturedEmployerSurface =
	(typeof FEATURED_EMPLOYER_SURFACES)[number]

// TODO(?): confirm exact member values against the Canonical Enum Registry (Q-BILL-2).
export const CAMPAIGN_STATUSES = [
	"draft",
	"scheduled",
	"active",
	"completed",
	"cancelled",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

// TODO(?): confirm exact member values against the Canonical Enum Registry (Q-BILL-2).
export const CAMPAIGN_DELIVERY_STATUSES = [
	"pending",
	"delivering",
	"delivered",
	"failed",
] as const
export type CampaignDeliveryStatus =
	(typeof CAMPAIGN_DELIVERY_STATUSES)[number]

/**
 * Entity interfaces. Authoritative field lists live in the Field-Level Billing
 * Dictionary (Notion). Fields marked TODO(?) need confirmation (Q-BILL-3).
 */
export interface BillingAccount {
	id: string
	userId: string
	stripeCustomerId: string | null
	createdAt: string
	updatedAt: string
}

export interface Subscription {
	id: string
	billingAccountId: string
	stripeSubscriptionId: string | null
	planTier: PlanTier
	interval: BillingInterval
	status: BillingStatus
	isFounding: boolean
	foundingCouponKey: string | null
	currentPeriodStart: string | null
	currentPeriodEnd: string | null
	cancelAtPeriodEnd: boolean
	createdAt: string
	updatedAt: string
}

export interface AddOnPurchase {
	id: string
	billingAccountId: string
	addOnType: AddOnType
	sku: string
	quantity: number
	purchaseObjectType: PurchaseObjectType
	stripePaymentIntentId: string | null
	refundable: boolean
	createdAt: string
}

export interface BoostCampaign {
	id: string
	listingId: string
	addOnPurchaseId: string
	surface: BoostPlacementSurface
	status: CampaignStatus
	deliveryStatus: CampaignDeliveryStatus
	startsAt: string
	endsAt: string
}

export interface FeaturedEmployerCampaign {
	id: string
	hostId: string
	addOnPurchaseId: string
	surface: FeaturedEmployerSurface
	status: CampaignStatus
	deliveryStatus: CampaignDeliveryStatus
	startsAt: string
	endsAt: string
}

export interface EntitlementSnapshot {
	billingAccountId: string
	planTier: PlanTier
	// keyed by EntitlementKey (see ./entitlements); booleans or remaining counts.
	capabilities: Record<string, boolean | number>
	computedAt: string
}

export interface InviteCreditLedgerEntry {
	id: string
	billingAccountId: string
	delta: number
	reason: "plan_grant" | "pack_purchase" | "consumption" | "adjustment"
	relatedObjectType: PurchaseObjectType | "invite_credit_purchase"
	relatedObjectId: string | null
	createdAt: string
}

export interface BillingEvent {
	id: string
	eventType: string
	actorId: string | null
	objectType: PurchaseObjectType
	objectId: string | null
	payload: Record<string, unknown>
	createdAt: string
}
