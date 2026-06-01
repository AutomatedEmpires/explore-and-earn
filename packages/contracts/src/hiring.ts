// Hiring contracts — TYPE-ONLY. No auto-decision logic. The system ranks/
// recommends/explains only; hosts decide. No auto_reject / auto_hire.
// Source of truth: Canonical Enum Registry (HostSeekerDisposition),
// "Application & Host Review Pipelines", Permission/Visibility/RLS Registry.

/** Host disposition toward a seeker (canon: HostSeekerDisposition). "shortlisted" prohibited. */
export type HostSeekerDisposition =
	| "saved"
	| "skipped"
	| "invited"
	| "offered"
	| "not_selected"
	| "accepted"

/** Host team roles (canon: Permission/Visibility/RLS Registry). */
export type HostTeamRole =
	| "owner"
	| "admin"
	| "hiring_manager"
	| "analyst"
	| "billing"
	| "viewer"

/**
 * Fields visible to a host in MATCHED-BUCKET context (Permission/Visibility/RLS
 * Registry). Full contact / raw resume / private notes are NOT here — they require
 * an application/invite context. Enforced server-side + RLS; this is documentation
 * of the allowed projection, type-only.
 */
export type HostVisibleCandidateField =
	| "match_score"
	| "match_confidence"
	| "match_reasons"
	| "match_band"
	| "desired_categories"
	| "desired_roles"
	| "relative_location"
	| "availability_summary"
	| "skills_tags"
	| "profile_completeness"
	| "trust_markers"

/** Host-facing candidate review row (projection). IDs + allowed fields only. */
export interface CandidateReviewRow {
	seekerProfileId: string
	listingId: string
	rank: number
	band?: string
	disposition?: HostSeekerDisposition
	// Populated only with HostVisibleCandidateField-allowed data.
}

/** A single hiring-pipeline event (audit). Names mirror Canonical Event Registry. */
export interface HiringEvent {
	type: string // TODO(?) narrow to MatchingHiringEventType once Event Registry is mirrored in contracts
	actor: "seeker" | "host" | "system"
	occurredAt: string
	/** IDs only — never protected attributes or raw resume content. */
	context?: Record<string, string>
}
