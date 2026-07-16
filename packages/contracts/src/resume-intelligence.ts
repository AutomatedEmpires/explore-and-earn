// Résumé intelligence contracts — provenance-preserving analysis of a
// seeker's ACTUAL resume data (experiences / educations / certifications /
// profile), consumed by the resume builder, The Guide, and the future
// import/parser lane.
//
// NO-FABRICATION LAW (charter §2.4 / §4.8):
//  - A ParsedFact comes verbatim from stored resume rows.
//  - An Inference carries the evidence (which row + field + excerpt supported
//    it) and a confidence grade — it is never presented as fact.
//  - A Suggestion is a PROPOSAL: nothing may write it to the canonical
//    profile until the user has seen it and explicitly accepted it through
//    the normal owner-authenticated resume actions. Assistants have no write
//    tools; autonomous publishing is structurally impossible.
//  - Missing information is reported as missing, never filled in.

/* --------------------------------------------------------------- provenance */

/** Where a piece of evidence came from, precisely enough to audit. */
export interface ResumeEvidence {
	/** Which stored record supported this. */
	readonly source: "experience" | "education" | "certification" | "profile"
	/** Row id for experience/education/certification; null for profile fields. */
	readonly sourceId: string | null
	/** The field on that record (e.g. "skill_tags", "summary", "short_bio"). */
	readonly field: string
	/** Short verbatim excerpt from the field that supports the inference. */
	readonly excerpt?: string
}

export type InferenceConfidence = "high" | "medium" | "low"

/* ------------------------------------------------------------------- facts */

/** A skill grounded in stored data, with everywhere it appears. */
export interface SkillWithProvenance {
	readonly skill: string
	/** True when it is already on the profile's general_skill_tags. */
	readonly onProfile: boolean
	/** 'parsed' = explicit tag on a record; 'inferred' = derived from text. */
	readonly kind: "parsed" | "inferred"
	readonly confidence: InferenceConfidence
	readonly evidence: readonly ResumeEvidence[]
}

/* -------------------------------------------------------------------- gaps */

export const RESUME_GAP_CODES = [
	"missing_bio",
	"missing_display_name",
	"no_experience",
	"experience_without_summary",
	"no_education",
	"no_skills",
	"no_certifications",
	"missing_desired_categories",
	"missing_location",
	"missing_seeking_timeline",
] as const
export type ResumeGapCode = (typeof RESUME_GAP_CODES)[number]

export interface ResumeGap {
	readonly code: ResumeGapCode
	/** Row id when the gap is about one record (e.g. a summary-less job). */
	readonly sourceId?: string
}

/* --------------------------------------------------------------- conflicts */

export const RESUME_CONFLICT_CODES = [
	"experience_dates_inverted",
	"education_dates_inverted",
	"current_role_with_end_date",
	"duplicate_experience",
	"certification_expired",
] as const
export type ResumeConflictCode = (typeof RESUME_CONFLICT_CODES)[number]

export interface ResumeConflict {
	readonly code: ResumeConflictCode
	readonly sourceId: string
	/** Second record involved (duplicates). */
	readonly relatedSourceId?: string
	readonly detail?: string
}

/* ------------------------------------------------------------- suggestions */

export const RESUME_SUGGESTION_KINDS = [
	/** Add an inferred skill to general_skill_tags (evidence attached). */
	"add_general_skill",
	/** Write a summary for an experience that has none. */
	"add_experience_summary",
	/** Fill a missing profile field (bio, categories, timeline, location). */
	"complete_profile_field",
	/** Resolve a detected conflict (inverted dates, duplicate, expired cert). */
	"resolve_conflict",
] as const
export type ResumeSuggestionKind = (typeof RESUME_SUGGESTION_KINDS)[number]

/**
 * A reviewable proposal. `value` is what would be added/changed IF the user
 * accepts; suggestions with evidence show exactly why they were made.
 */
export interface ResumeSuggestion {
	readonly kind: ResumeSuggestionKind
	/** Machine value (e.g. the skill tag, the profile field name). */
	readonly value: string
	readonly confidence: InferenceConfidence
	readonly evidence: readonly ResumeEvidence[]
	/** Gap/conflict this addresses, when applicable. */
	readonly addresses?: ResumeGapCode | ResumeConflictCode
}

/* ----------------------------------------------------------------- insights */

/** The full deterministic analysis of one seeker's stored resume. */
export interface ResumeInsights {
	/** 0–100 readiness (mirrors the resume-builder completion heuristic). */
	readonly completeness: number
	readonly skills: readonly SkillWithProvenance[]
	readonly gaps: readonly ResumeGap[]
	readonly conflicts: readonly ResumeConflict[]
	readonly suggestions: readonly ResumeSuggestion[]
	/** Counts of the underlying real records (honest volume signal). */
	readonly counts: {
		readonly experiences: number
		readonly educations: number
		readonly certifications: number
	}
}

/** Listing-specific preparation derived from insights + listing requirements. */
export interface ListingPreparation {
	/** Required listing skills the seeker's data already covers (with evidence). */
	readonly coveredSkills: readonly SkillWithProvenance[]
	/** Required listing skills nothing in the resume supports. */
	readonly missingSkills: readonly string[]
	/** Required certifications present / missing by name. */
	readonly coveredCertifications: readonly string[]
	readonly missingCertifications: readonly string[]
}
