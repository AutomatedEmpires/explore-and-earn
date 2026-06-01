// Application contracts — TYPE-ONLY. No transition execution, no DB calls.
// Source of truth: Canonical Enum Registry (ApplicationStatus), Lifecycle Registry,
// "Application, Invite & Offer State Machines". Transitions are validated at runtime
// against packages/contracts/lifecycles.ts (G16) and values imported, not literal (G13).
//
// NOTE: This union mirrors the Canonical Enum Registry verbatim. When lifecycles.ts/
// enums.ts are regenerated (Contracts V1), prefer importing the canonical type.

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
