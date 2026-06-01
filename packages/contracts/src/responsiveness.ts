// Responsiveness contracts — TYPE-ONLY. Internal-only signals. No scoring,
// no suppression, no ranking effect. Penalty behavior is founder-gated (TODO?).
// Source of truth: "Matching Pipeline", "Matching, Invites & Applicant Review".
// Rule: never publicly shame seekers; separate "not interested" from "inactive".

export type ResponsivenessSignalKind =
	| "profile_last_active"
	| "invite_response_rate"
	| "application_response_rate"
	| "offer_response_rate"
	| "recent_ignored_invites"
	| "accepted_offer_completion_history"
	| "notification_delivery_state"

/** Internal-only. Host transparency, if any, is aggregate + explainable. */
export interface ResponsivenessSignal {
	kind: ResponsivenessSignalKind
	visibility: "internal" // never seeker/host raw
	/** Descriptive only; weighting is TODO(?) and founder-gated. */
	note?: string
}

// TODO(?) cold-start protection window + recovery curve — founder-gated.
