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

export type InviteTerminalState = "applied" | "ignored" | "expired" | "withdrawn"

/** Type-level adjacency mirroring canon. Runtime authority: lifecycles.ts (G16). TODO(?) beyond this. */
export type InviteTransitions = {
	created: "delivered" | "withdrawn"
	delivered: "viewed" | "ignored" | "expired" | "withdrawn"
	viewed: "applied" | "ignored" | "expired" | "withdrawn"
	applied: never
	ignored: never
	expired: never
	withdrawn: never
}

/** Expires 14 days after send (canon). */
export const INVITE_EXPIRE_DAYS = 14 // canon — Lifecycle Registry

/** Host tier → included invite credits (canon: Host Dashboard Spec). */
export type HostTier = "starter" | "professional" | "enterprise"

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
// TODO(?) reminder offsets (proposed T-3, T-1 days) — founder-gated.
// TODO(?) invite_credit_restored conditions — needs canon.
