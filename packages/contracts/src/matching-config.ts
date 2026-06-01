// Matching tuning configuration — LOCKED V1 VALUES (data/config only, NOT an algorithm).
// Founder-authorized 2026-05-31. Justification: docs/matching/match-tuning-v1-decisions.md
// ADR mirror: docs/source-of-truth/decisions/ADR-0001-matching-tuning-v1.md
//
// This file contains CONFIGURATION CONSTANTS only. There is NO scoring function, NO
// ranking logic, and NO I/O here. The scoring ENGINE that consumes these values remains
// founder-gated and unimplemented (see docs/security/matching-fairness-approval-gates.md).
//
// Guardrails: G8 (NO monetization fields — none present here), G11 (host-visible band is
// categorical; thresholds below DRIVE the band while raw numbers stay admin-only),
// G13 (component keys mirror ./matching). MUST NOT add protected/sensitive fields
// (see docs/matching/prohibited-signals-v1.md). Proposed CI checks: G31 (component weights
// sum to 100), G32 (each sub-weight block sums to its parent), G33 (band thresholds strictly
// ordered), G34 (no stored explanation text).

import type { MatchScoreComponentKey } from "./matching"

/**
 * Top-level component weights. MUST sum to 100.
 * Source: canon "Exact Ranking, Matching & Boost Formula"; ratified 2026-05-31.
 */
export const MATCH_COMPONENT_WEIGHTS_V1: Readonly<Record<MatchScoreComponentKey, number>> = {
	timeline_availability: 20,
	skills_certifications: 20,
	role_category: 15,
	housing_meals_pay: 15,
	location_travel: 10,
	goals_open_to: 10,
	completeness_confidence: 5,
	behavioral_reliability: 5,
} as const

/**
 * Per-component sub-weights. Each block MUST sum to its parent component weight.
 * Architect-determined 2026-05-31 under founder authorization (rationale in the decisions doc).
 */
export const MATCH_SUBWEIGHTS_V1 = {
	timeline_availability: { window_overlap_ratio: 14, start_date_alignment: 4, shift_compatibility: 2 },
	skills_certifications: { required_skill_coverage: 12, preferred_skill_coverage: 5, structured_tag_overlap: 3 },
	role_category: { primary_category: 11, adjacent_category: 4 },
	housing_meals_pay: { housing_meets_need: 5, meals_meets_pref: 3, pay_meets_minimum: 5, pay_above_minimum_margin: 2 },
	location_travel: { within_region_or_commute: 6, travel_willingness: 4 },
	goals_open_to: { explicit_open_to_category: 6, stated_goal_alignment: 4 },
	completeness_confidence: { completeness: 5 },
	behavioral_reliability: { activity_recency: 3, response_rate: 2 },
} as const

/** Hard-modifier caps (canon, ratified). Applied AFTER raw score; explainable, never hidden. */
export const MATCH_HARD_MODIFIER_CAPS_V1 = {
	required_cert_missing: 60,
	timeline_conflict: 50,
	housing_required_not_included: 65,
	visa_unavailable: 50,
	// trust_concern is handled by moderation: cap OR hide (no fixed numeric cap).
} as const

/** Host/internal band thresholds (inclusive lower bound). Drives the categorical band (G11). */
export const MATCH_BAND_THRESHOLDS_V1 = {
	strong_min: 75,
	developing_min: 50,
	// score < developing_min => "needs_attention"
} as const

/** Confidence-based display gating (0-100). Prevents false precision. */
export const MATCH_CONFIDENCE_DISPLAY_V1 = {
	withhold_below: 40, // hide score + band; show "building match"
	qualify_below: 60, // 40..59 => show band with a "limited info" qualifier
	// confidence >= 60 => full display
} as const

/**
 * Inactivity / responsiveness model. Touches behavioral_reliability (max 5 pts) ONLY.
 * Never hides a candidate; never excludes; recoverable. See responsiveness-inactivity-v1.md.
 */
export const RESPONSIVENESS_MODEL_V1 = {
	component_max_points: 5,
	cold_start: { min_days_since_signup: 14, min_opportunities_presented: 3 },
	// activity_recency contributes up to 3 of the 5 points; floor 0.5 (never 0, never excludes).
	activity_recency_points: [
		{ max_days: 7, points: 3.0 },
		{ max_days: 21, points: 2.0 },
		{ max_days: 45, points: 1.0 },
		{ max_days: null, points: 0.5 },
	],
	// response_rate contributes up to 2 of the 5 points. not_interested declines are NOT ignores.
	response_rate: {
		min_sample: 5,
		window_days: 90,
		bands: [
			{ max_ignore_rate: 0.2, points: 2.0 },
			{ max_ignore_rate: 0.5, points: 1.0 },
			{ max_ignore_rate: 1.0, points: 0.5 },
		],
		below_sample_points: 2.0,
	},
} as const

/** Invite anti-spam caps. Protects seeker trust; respects host tier economics. */
export const INVITE_ANTISPAM_V1 = {
	max_active_per_host_seeker_listing: 1,
	max_active_per_host_seeker: 2,
	max_per_host_seeker_per_30d: 3,
	host_daily_soft_cap: 50,
	seeker_daily_surfaced_cap: 10,
	credit_restored_when: ["withdrawn_before_delivered", "expired_before_delivered"],
} as const

/** Reminder schedule (POLICY locked; SENDING deferred to the Notification build pack). Days before expiry. */
export const REMINDER_SCHEDULE_V1 = {
	invite_expires_soon_days_before: [3, 1],
	offer_expires_soon_days_before: [3, 1],
	profile_incomplete: { cadence: "weekly", max_per_week: 1 },
	max_reminders_per_object: 2,
} as const

/** Lifecycle expiry windows (canon, ratified). Mirrors day-constants in lifecycle contracts. */
export const LIFECYCLE_EXPIRY_DAYS_V1 = {
	application_auto_expire: 30,
	invite_expire: 14,
	offer_expire: 7, // measured from extended_at
} as const

/** Not-selected policy. Neutral, non-shaming; does NOT feed any seeker matching penalty. */
export const NOT_SELECTED_POLICY_V1 = {
	expose_reason_to_seeker: false,
	store_reason_freetext: false,
	feeds_seeker_behavioral_penalty: false,
	reapply_after_days: 30,
	reapply_on_listing_reopen: true,
	max_applications_per_seeker_listing_per_year: 2,
} as const

/** Locked band labels (V1 copy). Seeker copy is encouraging; host copy is operational. */
export const BAND_LABELS_V1 = {
	seeker: { strong: "Strong fit", developing: "Good fit", needs_attention: "Partial fit" },
	host: { strong: "Strong", developing: "Developing", needs_attention: "Needs attention" },
} as const

/** Explanation handling: derive on read (do NOT store explanation text); persist structured reasons only. */
export const EXPLANATION_STORAGE_V1 = {
	store_explanation_text: false,
	persist_structured_reasons_only: true,
} as const

// ---------------------------------------------------------------------------
// Determinism & edge-case config (LOCKED — ADR-0001 §17).
// Full spec: docs/matching/match-edge-cases-v1.md. Tests: docs/security/matching-guardrail-tests-v1.md.
// Data/config only — the engine that applies these rules remains founder-gated.
// ---------------------------------------------------------------------------

/**
 * Score determinism & rounding. Display is informational; the BAND carries meaning.
 * Band is computed from the INTERNAL (unrounded) score; the displayed integer is CLAMPED
 * into the band's range so a shown number can never contradict its band (e.g. an internal
 * 74.6 displays as 74 with a "Developing" band, never a misleading 75). Half-up rounding.
 */
export const MATCH_SCORE_ROUNDING_V1 = {
	internal_precision: "float", // engine works in float; never expose decimals
	display: "integer", // round to nearest integer for display
	round_half: "up", // 0.5 rounds away from zero
	band_source: "internal_unrounded", // band derived from the float score, not the display int
	clamp_display_into_band: true, // displayed int clamped to [band_min, band_max]
	show_numeric_min_confidence: 60, // numeric shown only at confidence >= 60 (mirrors display gate)
} as const

/**
 * Hard-modifier stacking. When multiple caps apply, take the MOST restrictive (minimum) cap —
 * never average, never additive. A cap is a ceiling, so the lowest ceiling wins. Every applied
 * cap emits a MatchConcern (no hidden disqualifiers).
 */
export const MATCH_MODIFIER_STACKING_V1 = {
	rule: "apply_minimum_cap",
	emit_concern_per_cap: true,
} as const

/**
 * Deterministic tie-break order for ranking within a host's candidate pool.
 * Fit-first, then a single neutral promptness step, then a STABLE deterministic key.
 * NEVER random; NEVER a protected/sensitive attribute; NEVER engagement as a primary key.
 */
export const MATCH_TIEBREAK_ORDER_V1 = [
	"score_desc", // 1. higher relevance first
	"confidence_desc", // 2. better-evidenced score first
	"required_skill_coverage_desc", // 3. stronger gating-reality fit (true fit, not behavior)
	"applied_at_asc", // 4. neutral promptness (first-come); null sorts last
	"match_result_version_desc", // 5. freshest computation
	"stable_id_hash_asc", // 6. deterministic final key (hash of seekerProfileId) — never random
] as const

/**
 * Missing-data policy. Absence of data NEVER lowers SCORE and NEVER caps; it lowers CONFIDENCE
 * and surfaces a "needs info" prompt. Fairness: candidates are nudged via confidence gating +
 * completion prompts, never punished via score for an incomplete profile.
 */
export const MATCH_MISSING_DATA_POLICY_V1 = {
	missing_optional_signal: "contributes_zero_to_subweight_no_cap",
	missing_required_listing_requirement: "treat_unknown_no_cap_surface_needs_info",
	missing_blocks_score_caps: false, // never cap purely because data is absent
	missing_lowers_confidence: true, // route the gap to confidence + prompts instead
} as const

/**
 * Empty / sparse candidate pool. Never fabricate matches to fill space; show an honest
 * pool-building prompt. Mirrors events empty_match_bucket_shown / match_pool_building_prompt_shown.
 */
export const MATCH_EMPTY_POOL_POLICY_V1 = {
	fabricate_to_fill: false,
	min_results_before_prompt: 1, // fewer than this -> show building prompt, not filler
	show_building_prompt_when_empty: true,
} as const
