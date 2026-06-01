// Matching contracts — TYPE-ONLY (types + interfaces). No scoring algorithm, no I/O.
// Numeric tuning (weights, sub-weights, caps, band thresholds, inactivity, anti-spam,
// reminders) is now LOCKED as config in ./matching-config.ts (founder-authorized
// 2026-05-31; see docs/source-of-truth/decisions/ADR-0001-matching-tuning-v1.md and
// docs/matching/match-tuning-v1-decisions.md). The scoring ENGINE that consumes those
// values remains founder-gated (production deploy) and unimplemented.
//
// Source of truth: Notion "Exact Ranking, Matching & Boost Formula",
// "Matching Pipeline / Scoring / Refresh". Status/enum unions mirror the Canonical Enum
// Registry; when enums.ts is regenerated (Contracts V1), prefer importing from there.
//
// Guardrails: G8 (no monetization in score), G11 (host-visible band is categorical,
// raw numeric admin-only). MUST NOT add protected-class fields (see
// docs/matching/prohibited-signals-v1.md).

/** Heuristic relevance estimate, 0-100. Never a hiring decision. */
export type MatchScore = number

/** Confidence in the score, 0-100 (separate axis from score). */
export type MatchConfidence = number

/** Host-visible categorical band. Thresholds LOCKED in matching-config.ts (strong >=75, developing >=50). */
export type MatchBand = "strong" | "developing" | "needs_attention"

/** Canonical scoring component keys (mirror weight table; weights live in matching-config.ts). */
export type MatchScoreComponentKey =
	| "timeline_availability"
	| "skills_certifications"
	| "role_category"
	| "housing_meals_pay"
	| "location_travel"
	| "goals_open_to"
	| "completeness_confidence"
	| "behavioral_reliability"

/** Canonical hard-modifier kinds (caps applied after raw score). Cap VALUES in matching-config.ts. */
export type MatchHardModifierKind =
	| "required_cert_missing"
	| "timeline_conflict"
	| "housing_required_not_included"
	| "visa_unavailable"
	| "trust_concern"

/** Canonical exclusion reasons (candidate not scored / not surfaced at all). */
export type MatchExclusionReason =
	| "listing_not_live"
	| "seeker_blocked_or_restricted"
	| "account_banned_or_suspended"
	| "listing_closed_or_archived"

export type MatchSignalKind =
	| "availability_fit"
	| "category_role_fit"
	| "skills_cert_fit"
	| "housing_pref_fit"
	| "meals_pref_fit"
	| "pay_fit"
	| "location_travel_fit"
	| "goals_open_to_fit"
	| "completeness_confidence"
	| "behavioral_reliability"
	| "host_requirements_fit"
// "work_style_fit" — deferred to V2 (decision 2026-05-31; not in canonical 100-pt table).

export type MatchSignalVisibility = "seeker" | "host" | "internal"

/** A single contributing signal. Contribution is descriptive; locked weights live in matching-config.ts. */
export interface MatchSignal {
	kind: MatchSignalKind
	visibility: MatchSignalVisibility
	/** Human-readable reason line for explanations. */
	reason?: string
}

/** A surfaced concern (e.g., hard-modifier condition). Must be explainable, never hidden. */
export interface MatchConcern {
	kind: MatchHardModifierKind
	message: string
}

/** Plain-language explanation bound to a MatchResult. Required wherever score is shown. */
export interface MatchExplanation {
	topSignals: MatchSignal[]
	missingInformation: string[]
	concerns: MatchConcern[]
	generatedAt: string
	staleAt?: string
	/** Always present: attributes/inputs explicitly NOT considered. */
	notConsidered: string[]
}

/**
 * Inputs allowed into scoring. By construction this type contains NO monetization
 * fields (pricing/entitlements/boost/featured) — guardrail G8 — and NO protected/
 * sensitive attributes (see prohibited-signals-v1.md). Adding such a field is a
 * guardrail violation. Shapes are placeholders/handles to future read models.
 */
export interface MatchInput {
	seekerProfileId: string
	listingId: string
	// Structured, requirement-tied inputs only — NO free demographic inference.
	availability?: unknown // TODO(?) shape from Seeker Profile canon
	structuredSkills?: string[]
	requiredCertifications?: string[]
	category?: string
	housingNeeded?: boolean
	mealsPreferred?: boolean
	payMinimum?: number
	// NOTE: deliberately NO `boost`, `tier`, `price`, `featured`, or any protected field.
}

/** Hybrid refresh trigger classes (canon). */
export type MatchRefreshTrigger = "immediate" | "queued_bulk" | "scheduled_stale"

/** Staleness bookkeeping (internal). */
export interface MatchStaleness {
	generatedAt: string
	staleAt: string
	version: string
	lastTrigger?: MatchRefreshTrigger
}

/** Criteria used to assemble an eligible candidate pool (canon). */
export interface CandidatePoolCriteria {
	category?: string
	timelineWindow?: { start: string; end: string }
	location?: unknown // relative/region handle — TODO(?)
	preferences?: unknown // TODO(?)
	eligibilityOnly: boolean
	/** Boosted membership affects pool/placement only — NEVER score (G8). */
	includeBoosted?: boolean
}

/** Persisted match result. Stored, not computed on read (canon). */
export interface MatchResult {
	seekerProfileId: string
	listingId: string
	score: MatchScore
	confidence: MatchConfidence
	band?: MatchBand
	reasons: MatchSignal[]
	generatedAt: string
	staleAt: string
	version: string
}

/** A seeker-facing recommendation derived from a MatchResult. */
export interface MatchRecommendation {
	listingId: string
	score?: MatchScore
	band?: MatchBand
	explanation?: MatchExplanation
}

/** Snapshot of a candidate's rank within a host's pool at a point in time. */
export interface CandidateRankSnapshot {
	listingId: string
	seekerProfileId: string
	rank: number
	matchResultVersion: string
	capturedAt: string
}
