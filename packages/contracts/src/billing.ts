/**
 * Billing domain contracts — Explore&Earn Payments V1 (DRAFT, type-only).
 *
 * Source of truth (Notion canon):
 *  - Canonical Enum Registry (PlanTier, BillingStatus, PurchaseObjectType,
 *    CampaignStatus, CampaignDeliveryStatus, boost/featured surfaces)
 *  - Field-Level Billing Dictionary (entity field lists + sub-enums)
 *  - Founder Locked Pricing / ADR-028 (AMOUNTS live in ./pricing.ts, NOT here)
 *
 * RULES:
 *  - No Stripe SDK imports. No live calls. No secrets. No feature/runtime logic.
 *  - This file contains NO price amounts (guardrail G1). Amounts are owned by
 *    ./pricing.ts to avoid a second pricing source of truth.
 *
 * Q-BILL-2 (RESOLVED): CampaignStatus / CampaignDeliveryStatus member values
 *   now mirror the Canonical Enum Registry exactly.
 * Q-BILL-3 (RESOLVED): entity field lists + sub-enums now mirror the
 *   Field-Level Billing Dictionary. Fields that augment the dictionary's DB
 *   column list (founding / interval modeling) are marked inline.
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

// Canon: Field-Level Billing Dictionary — AddOnPurchase.add_on_type.
export const ADD_ON_TYPES = [
	"additional_listing",
	"boost",
	"featured_employer",
	"announcement",
	"invite_pack",
	"team_seat",
] as const
export type AddOnType = (typeof ADD_ON_TYPES)[number]

// Canon: Canonical Enum Registry — BoostPlacementSurface.
export const BOOST_PLACEMENT_SURFACES = [
	"seek",
	"swipe",
	"map_drawer",
	"map_pin",
	"community_feed",
	"homepage",
] as const
export type BoostPlacementSurface = (typeof BOOST_PLACEMENT_SURFACES)[number]

// Canon: Canonical Enum Registry — FeaturedEmployerSurface.
export const FEATURED_EMPLOYER_SURFACES = [
	"homepage",
	"seek_dashboard",
	"category_dashboard",
] as const
export type FeaturedEmployerSurface =
	(typeof FEATURED_EMPLOYER_SURFACES)[number]

// Canon: Canonical Enum Registry — CampaignStatus (Q-BILL-2 resolved).
export const CAMPAIGN_STATUSES = [
	"scheduled",
	"active",
	"paused",
	"completed",
	"cancelled",
	"refunded",
	"removed",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

// Canon: Canonical Enum Registry — CampaignDeliveryStatus (Q-BILL-2 resolved).
export const CAMPAIGN_DELIVERY_STATUSES = [
	"under_delivered",
	"on_track",
	"over_delivered",
	"blocked",
	"completed",
] as const
export type CampaignDeliveryStatus =
	(typeof CAMPAIGN_DELIVERY_STATUSES)[number]

// Canon: Field-Level Billing Dictionary — AddOnPurchase.status.
export const ADD_ON_PURCHASE_STATUSES = [
	"pending",
	"paid",
	"failed",
	"refunded",
	"cancelled",
] as const
export type AddOnPurchaseStatus = (typeof ADD_ON_PURCHASE_STATUSES)[number]

// Canon: Field-Level Billing Dictionary — InviteCreditLedger.source_type.
export const INVITE_CREDIT_SOURCE_TYPES = [
	"plan_included",
	"purchase",
	"refund_restore",
	"admin_adjustment",
	"usage",
] as const
export type InviteCreditSourceType =
	(typeof INVITE_CREDIT_SOURCE_TYPES)[number]

// Canon: Field-Level Billing Dictionary — InviteCreditLedger.related_object_type.
export const INVITE_CREDIT_RELATED_OBJECT_TYPES = [
	"invite",
	"purchase",
	"refund_review",
	"subscription",
	"admin_adjustment",
] as const
export type InviteCreditRelatedObjectType =
	(typeof INVITE_CREDIT_RELATED_OBJECT_TYPES)[number]

/**
 * Entity interfaces. Field lists mirror the Field-Level Billing Dictionary
 * (snake_case columns -> camelCase). Amounts are never embedded (G1).
 */

// Field-Level Billing Dictionary — Entity: BillingAccount.
export interface BillingAccount {
	id: string
	hostProfileId: string
	stripeCustomerId: string | null
	billingEmail: string
	status: BillingStatus
	currentPlan: PlanTier
	planStartedAt: string | null
	planRenewsAt: string | null
	cancelledAt: string | null
	createdAt: string
	updatedAt: string
}

// Field-Level Billing Dictionary — Entity: Subscription.
export interface Subscription {
	id: string
	billingAccountId: string
	stripeSubscriptionId: string | null
	planTier: PlanTier
	status: BillingStatus
	currentPeriodStart: string | null
	currentPeriodEnd: string | null
	cancelAtPeriodEnd: boolean
	// Canon augmentation (SKU Catalog / ADR-030): `interval` mirrors the Stripe
	// price cadence; founding state mirrors the attached forever coupon. These
	// extend the dictionary's column list to model founding subscriptions.
	interval: BillingInterval
	isFounding: boolean
	foundingCouponKey: string | null
	createdAt: string
	updatedAt: string
}

// Field-Level Billing Dictionary — Entity: AddOnPurchase.
export interface AddOnPurchase {
	id: string
	hostProfileId: string
	billingAccountId: string
	addOnType: AddOnType
	// Conventional Stripe price key (SKU label, never a bare price string).
	sku: string
	quantity: number
	// Transaction record of the amount charged, in integer USD cents.
	amountPaidCents: number
	currency: string
	stripePaymentIntentId: string | null
	status: AddOnPurchaseStatus
	createdAt: string
	updatedAt: string
}

// Field-Level Billing Dictionary — Entity: BoostCampaign.
export interface BoostCampaign {
	id: string
	listingId: string
	hostProfileId: string
	purchaseId: string | null
	status: CampaignStatus
	deliveryStatus: CampaignDeliveryStatus
	startsAt: string
	endsAt: string
	targetImpressions: number | null
	deliveredImpressions: number
	surfaces: ReadonlyArray<BoostPlacementSurface>
	createdAt: string
	updatedAt: string
}

// Field-Level Billing Dictionary — Entity: FeaturedEmployerCampaign.
export interface FeaturedEmployerCampaign {
	id: string
	hostProfileId: string
	purchaseId: string | null
	status: CampaignStatus
	deliveryStatus: CampaignDeliveryStatus
	// Scoped category dashboards (category identifiers), per the dictionary.
	categoryScopes: ReadonlyArray<string>
	startsAt: string
	endsAt: string
	deliveredImpressions: number
	createdAt: string
	updatedAt: string
}

// Field-Level Billing Dictionary — Entity: EntitlementSnapshot.
export interface EntitlementSnapshot {
	id: string
	hostProfileId: string
	planTier: PlanTier
	listingCapacity: number
	liveListingCount: number
	includedInviteCreditsRemaining: number
	purchasedInviteCreditBalance: number
	announcementCreditsRemaining: number
	teamSeatCapacity: number
	teamSeatsUsed: number
	generatedAt: string
}

// Field-Level Billing Dictionary — Entity: InviteCreditLedger.
export interface InviteCreditLedgerEntry {
	id: string
	hostProfileId: string
	sourceType: InviteCreditSourceType
	delta: number
	balanceAfter: number
	relatedObjectType: InviteCreditRelatedObjectType | null
	relatedObjectId: string | null
	createdByUserId: string | null
	createdAt: string
}

/**
 * Internal billing event row (server-side audit stream). Event-type tokens are
 * enumerated in ./billing-events.ts (INTERNAL_BILLING_EVENTS).
 */
export interface BillingEvent {
	id: string
	eventType: string
	actorId: string | null
	objectType: PurchaseObjectType
	objectId: string | null
	payload: Record<string, unknown>
	createdAt: string
}
