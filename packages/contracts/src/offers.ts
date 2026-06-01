// Offer contracts — TYPE-ONLY. No sending, no acceptance writes, no contract generation.
// Source of truth: Canonical Enum Registry (OfferStatus), Lifecycle Registry,
// "Application, Invite & Offer State Machines".
// V1 offers are informational marketplace offers, NOT legally binding employment
// contracts (binding semantics are founder + legal gated).

export type OfferState =
	| "created"
	| "delivered"
	| "viewed"
	| "accepted"
	| "declined"
	| "expired"
	| "withdrawn"

/** Expires 7 days after extended_at (canon). Change is a founder gate. */
export const OFFER_EXPIRE_DAYS = 7 // canon — Lifecycle Registry

/** Triad summary: HOUSING / MEALS / PAY (never "perks"). */
export interface OfferTermsSummary {
	paySummary?: string
	housingProvided?: boolean
	mealsProvided?: boolean
	// TODO(?) structured terms shape — needs canon.
}

export interface Offer {
	id: string
	hostId: string
	seekerProfileId: string
	listingId: string
	state: OfferState
	terms?: OfferTermsSummary
	extendedAt?: string
	expiresAt?: string
	createdAt: string
	updatedAt: string
}
