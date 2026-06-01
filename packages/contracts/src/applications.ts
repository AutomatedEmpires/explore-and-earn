// Application contracts — TYPE-ONLY. No transition execution, no DB calls.
// Source of truth: Canonical Enum Registry (ApplicationStatus), Lifecycle Registry,
// "Application, Invite & Offer State Machines". Transitions are validated at runtime
// against packages/contracts/lifecycles.ts (G16) and values imported, not literal (G13).
//
// NOTE: This union + the adjacency type mirror the Canonical Enum/Lifecycle
// Registries verbatim for editor support. lifecycles.ts remains runtime authority.
// When lifecycles.ts/enums.ts are regenerated (Contracts V1), prefer importing.

export type ApplicationState =
	| "applied"
	| "reviewing"
	| "saved_by_host" // canonical host-save state. "shortlisted" is prohibited terminology.
	| "offered"
	| "accepted"
	| "active"
	| "completed"
	| "not_selected"
	| "withdrawn"
	| "expired"

/** Terminal application states (no further transitions). */
export type ApplicationTerminalState = "completed" | "not_selected" | "withdrawn" | "expired"

/**
 * Type-level adjacency mirroring canon (happy path + auto-expire/withdraw/
 * not-selected branches). Runtime authority is lifecycles.ts via
 * assert_lifecycle_transition(). Adjacency beyond this is TODO(?).
 */
export type ApplicationTransitions = {
	applied: "reviewing" | "withdrawn" | "expired"
	reviewing: "saved_by_host" | "offered" | "not_selected" | "withdrawn" | "expired"
	saved_by_host: "offered" | "not_selected" | "withdrawn" | "expired"
	offered: "accepted" | "not_selected" | "withdrawn"
	accepted: "active"
	active: "completed"
	completed: never
	not_selected: never
	withdrawn: never
	expired: never
}

/** Auto-expire after 30 days if still applied/reviewing/saved_by_host (canon). */
export const APPLICATION_AUTO_EXPIRE_DAYS = 30 // canon — Lifecycle Registry

/** `viewed` is metadata, NOT a lifecycle state (canon). */
export interface ApplicationViewMetadata {
	firstViewedAt?: string
	lastViewedAt?: string
	viewedBy?: string[]
}

export interface Application {
	id: string
	seekerProfileId: string
	listingId: string
	state: ApplicationState
	view?: ApplicationViewMetadata
	createdAt: string
	updatedAt: string
}
