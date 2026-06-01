// Invite contracts — TYPE-ONLY. No sending, no credit mutation.
// Source of truth: Canonical Enum Registry (InviteStatus), Lifecycle Registry,
// Host Dashboard Spec (invite credits/tiers).
// Invites are host-initiated and distinct from applications.

export type InviteState =
	| "created"
	| "delivered"
	| "viewed"
	| "applied"
	| "ignored"
	| "expired"
	| "withdrawn"

/** Expires 14 days after send (canon). */
export const INVITE_EXPIRE_DAYS = 14 // canon — Lifecycle Registry

export interface Invite {
	id: string
	hostId: string
	seekerProfileId: string
	listingId: string
	state: InviteState
	/** Match snapshot recorded at send time (canon). */
	matchResultId?: string
	createdAt: string
	expiresAt?: string
	updatedAt: string
}

// TODO(?) anti-spam per-host/per-seeker invite caps — needs canon/founder.
