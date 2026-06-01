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

/** A single hiring-pipeline event (audit). Names mirror Canonical Event Registry. */
export interface HiringEvent {
	type: string // TODO(?) narrow to matching-events union once Event Registry is mirrored in contracts
	actor: "seeker" | "host" | "system"
	occurredAt: string
	/** IDs only — never protected attributes or raw resume content. */
	context?: Record<string, string>
}
