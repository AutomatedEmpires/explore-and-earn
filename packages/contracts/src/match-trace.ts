// Match score trace — the structured, typed explanation layer over ADR-040.
//
// A MatchTrace is the full evidence record for one seeker↔listing score: every
// signal the engine actually used, tagged with the component it fed, its
// polarity, and the numeric/string params needed to render copy. It is the
// SINGLE source for "Why this fits" (seeker), "Why this seeker may fit" (host),
// debugging, analytics, and model evaluation — human copy is derived from the
// typed codes at RENDER time (G34: sentences are never persisted, and a model
// may never invent match reasons detached from these codes).
//
// Polarity vocabulary (charter §1.3):
//   positive  — real supporting evidence ("your availability overlaps the season")
//   negative  — real detracting evidence ("this role is outside your preferred region")
//   blocker   — a hard requirement is unmet (maps 1:1 to an applied MATCH_SCORE_CAP)
//   missing   — the data needed to evaluate is absent (reduces certainty, never fabricated)
//   weak      — genuine but low-confidence/low-weight evidence

import { MATCH_SCORE_WEIGHTS, type MatchBand, type MatchExclusion, type MatchScoreComponent } from "./matching-config"
import type { MatchCap, MatchComponentScores } from "./match"

/* ------------------------------------------------------------------ signals */

/**
 * Closed registry of trace signal codes. Every code is emitted by the engine's
 * trace builder from typed inputs — never by a model. Adding a code here
 * requires emitting it deterministically in packages/db/src/lib/matchTrace.ts
 * and adding render templates below (both audiences).
 */
export const MATCH_SIGNAL_CODES = [
	// categoryRoleFit
	"category_preferred",
	"category_mix_related",
	"category_not_preferred",
	"category_preference_missing",
	"roles_overlap",
	"required_skills_covered",
	"required_skills_partial",
	"required_skills_none",
	"interests_overlap",
	// locationTravelFit
	"remote_matches_preference",
	"remote_acceptable",
	"remote_but_prefers_onsite",
	"onsite_conflicts_remote_only",
	"travel_readiness_supports",
	"travel_readiness_limited",
	"travel_readiness_unknown",
	// availabilityOverlap
	"availability_overlaps_season",
	"availability_partial_overlap",
	"availability_no_overlap",
	"availability_open_now",
	"seeker_unavailable",
	"availability_unknown",
	"listing_dates_open",
	"listing_already_ended",
	// payAlignment
	"pay_meets_expectation",
	"pay_below_expectation",
	"pay_unknown",
	"pay_expectation_missing",
	// housingMealsFit
	"housing_included_matches_need",
	"housing_not_included_preferred",
	"housing_needs_unknown",
	"meals_included_matches_need",
	"meals_not_included_preferred",
	// caps (blockers) — 1:1 with MATCH_SCORE_CAPS keys
	"required_certification_missing",
	"impossible_timeline_conflict",
	"housing_required_not_included",
	"visa_support_unavailable",
	// profile / confidence
	"profile_thin",
] as const

export type MatchSignalCode = (typeof MATCH_SIGNAL_CODES)[number]

export type MatchSignalPolarity =
	| "positive"
	| "negative"
	| "blocker"
	| "missing"
	| "weak"

/** Params are primitives only — numbers/strings/booleans the templates interpolate. */
export type MatchSignalParams = Readonly<
	Record<string, string | number | boolean>
>

export interface MatchSignal {
	readonly code: MatchSignalCode
	/** Component this signal fed; null for cap-blockers (post-component). */
	readonly component: MatchScoreComponent | null
	readonly polarity: MatchSignalPolarity
	readonly params?: MatchSignalParams
}

/* -------------------------------------------------------------------- trace */

/**
 * The full explainable record for one scored pairing. Derives 1:1 from a
 * MatchResult plus the typed inputs that produced it; contains ONLY typed
 * codes + numbers (safe to log, persist, or hand to analytics — G34).
 */
export interface MatchTrace {
	readonly excluded: MatchExclusion | null
	readonly score: number
	readonly rawScore: number
	readonly band: MatchBand
	readonly confidence: number
	readonly components: MatchComponentScores
	readonly capsApplied: readonly MatchCap[]
	readonly signals: readonly MatchSignal[]
}

/** Map every cap to its blocker signal code (kept exhaustive by the type). */
export const CAP_SIGNAL_CODES: Record<MatchCap, MatchSignalCode> = {
	requiredCertificationMissing: "required_certification_missing",
	impossibleTimelineConflict: "impossible_timeline_conflict",
	housingRequiredButNotIncluded: "housing_required_not_included",
	visaSupportRequiredButUnavailable: "visa_support_unavailable",
}

/* ---------------------------------------------------------------- rendering */

export type MatchTraceAudience = "seeker" | "host"

interface SignalTemplates {
	/** Second person, addressed to the seeker ("Your availability…"). */
	readonly seeker: string
	/** Third person, addressed to a host about a candidate ("Their availability…"). */
	readonly host: string
}

/**
 * Render templates per code. `{name}` interpolates params. Presentation-only
 * (G34) — copy can change freely without touching persisted data. Codes, not
 * these strings, are the contract.
 */
const SIGNAL_TEMPLATES: Record<MatchSignalCode, SignalTemplates> = {
	category_preferred: {
		seeker: "You selected {category} as a preferred category.",
		host: "They selected {category} — this listing's category — as a preferred kind of work.",
	},
	category_mix_related: {
		seeker: "This mixed-work role overlaps the categories you're interested in.",
		host: "Their category interests partially overlap this mixed-work role.",
	},
	category_not_preferred: {
		seeker: "This is {category} work, which isn't in your preferred categories.",
		host: "This listing's category ({category}) is not among their stated preferences.",
	},
	category_preference_missing: {
		seeker: "You haven't picked preferred categories yet, so work-type fit can't be evaluated.",
		host: "They haven't stated category preferences, so work-type fit is unknown.",
	},
	roles_overlap: {
		seeker: "The role matches {matched} of the roles you're looking for.",
		host: "The role matches {matched} of the roles they're looking for.",
	},
	required_skills_covered: {
		seeker: "Your profile already covers all {total} skills this role asks for.",
		host: "Their profile covers all {total} skills this listing asks for.",
	},
	required_skills_partial: {
		seeker: "Your profile covers {covered} of the {total} skills this role asks for.",
		host: "Their profile covers {covered} of the {total} requested skills.",
	},
	required_skills_none: {
		seeker: "None of the {total} skills this role asks for are in your profile yet.",
		host: "None of the {total} requested skills appear in their profile.",
	},
	interests_overlap: {
		seeker: "This listing touches interests you've added to your profile.",
		host: "The listing's tags overlap their stated interests.",
	},
	remote_matches_preference: {
		seeker: "This is remote work, which matches your remote preference.",
		host: "This remote role matches their remote-work preference.",
	},
	remote_acceptable: {
		seeker: "This role can be done remotely, which fits broadly with your preferences.",
		host: "The role's remote nature is broadly compatible with their preferences.",
	},
	remote_but_prefers_onsite: {
		seeker: "This is remote work, but you prefer being on-site.",
		host: "This is remote work, but they prefer on-site roles.",
	},
	onsite_conflicts_remote_only: {
		seeker: "This role is on-site, but you've said you only want remote work.",
		host: "The role is on-site, but they've stated remote-only.",
	},
	travel_readiness_supports: {
		seeker: "Your travel readiness ({readiness}) supports taking an on-site role like this.",
		host: "Their travel readiness ({readiness}) supports relocating for this role.",
	},
	travel_readiness_limited: {
		seeker: "You've set your travel readiness to {readiness}, which limits on-site roles like this.",
		host: "Their travel readiness ({readiness}) may limit availability for this on-site role.",
	},
	travel_readiness_unknown: {
		seeker: "You haven't set travel readiness, so location fit is only partly evaluated.",
		host: "They haven't stated travel readiness, so location fit is only partly evaluated.",
	},
	availability_overlaps_season: {
		seeker: "Your availability covers this role's {overlapDays}-day season.",
		host: "Their availability covers the listing's {overlapDays}-day season.",
	},
	availability_partial_overlap: {
		seeker: "Your availability overlaps about {overlapPercent}% of this role's season.",
		host: "Their availability overlaps about {overlapPercent}% of the season.",
	},
	availability_no_overlap: {
		seeker: "Your stated availability doesn't overlap this role's dates at all.",
		host: "Their stated availability doesn't overlap the listing's dates.",
	},
	availability_open_now: {
		seeker: "You're available now, and this role is open.",
		host: "They're available now.",
	},
	seeker_unavailable: {
		seeker: "Your availability is currently set to unavailable.",
		host: "Their profile is currently marked unavailable.",
	},
	availability_unknown: {
		seeker: "Your profile doesn't include availability dates yet, so timing can't be evaluated.",
		host: "They haven't shared availability dates, so timing fit is unknown.",
	},
	listing_dates_open: {
		seeker: "This listing has an open season, so timing is flexible.",
		host: "The listing's open season keeps timing flexible.",
	},
	listing_already_ended: {
		seeker: "This listing's dates have already passed.",
		host: "The listing's dates have already passed.",
	},
	pay_meets_expectation: {
		seeker: "The pay meets your stated minimum.",
		host: "The listed pay meets their stated minimum.",
	},
	pay_below_expectation: {
		seeker: "The pay is about {payPercent}% of your stated minimum.",
		host: "The listed pay is about {payPercent}% of their stated minimum.",
	},
	pay_unknown: {
		seeker: "This listing doesn't state pay, so pay fit can't be evaluated.",
		host: "The listing doesn't state pay, so pay fit is unknown.",
	},
	pay_expectation_missing: {
		seeker: "You haven't set a pay expectation, so pay fit is neutral.",
		host: "They haven't stated a pay expectation.",
	},
	housing_included_matches_need: {
		seeker: "Housing is included, matching your stated preference.",
		host: "Included housing matches their stated housing need.",
	},
	housing_not_included_preferred: {
		seeker: "Housing isn't included, and you said you'd prefer it.",
		host: "Housing isn't included; they prefer housing to be provided.",
	},
	housing_needs_unknown: {
		seeker: "You haven't set a housing preference, so housing fit is only partly evaluated.",
		host: "They haven't stated a housing preference.",
	},
	meals_included_matches_need: {
		seeker: "Meals are included, matching your preference.",
		host: "Included meals match their preference.",
	},
	meals_not_included_preferred: {
		seeker: "Meals aren't included, and you said you'd prefer them.",
		host: "Meals aren't included; they prefer meals provided.",
	},
	required_certification_missing: {
		seeker: "This role requires certifications your profile doesn't list yet.",
		host: "They don't list all the certifications this role requires.",
	},
	impossible_timeline_conflict: {
		seeker: "Your availability and this role's dates can't be reconciled.",
		host: "Their availability can't be reconciled with the listing's dates.",
	},
	housing_required_not_included: {
		seeker: "You require housing, but this listing doesn't include it.",
		host: "They require housing, which this listing doesn't include.",
	},
	visa_support_unavailable: {
		seeker: "You need visa support, which this listing doesn't offer.",
		host: "They need visa support, which this listing doesn't offer.",
	},
	profile_thin: {
		seeker: "Your profile doesn't yet include enough information for a confident match.",
		host: "Their profile is thin, so this score carries low confidence.",
	},
}

function interpolate(template: string, params?: MatchSignalParams): string {
	if (!params) return template
	return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
		const value = params[key]
		return value === undefined ? whole : String(value)
	})
}

/** Render one signal to audience copy. Presentation-only (G34). */
export function renderMatchSignal(
	signal: MatchSignal,
	audience: MatchTraceAudience,
): string {
	return interpolate(SIGNAL_TEMPLATES[signal.code][audience], signal.params)
}

/* ----------------------------------------------------------- trace ordering */

const POLARITY_RANK: Record<MatchSignalPolarity, number> = {
	blocker: 0,
	positive: 1,
	negative: 2,
	missing: 3,
	weak: 4,
}

/**
 * Order a trace's signals for display: blockers first (a seeker must see hard
 * incompatibilities before praise), then positives by their component's weight,
 * then negatives, missing-data notes, and weak evidence last.
 */
export function orderedTraceSignals(
	trace: Pick<MatchTrace, "signals">,
): readonly MatchSignal[] {
	return [...trace.signals].sort((a, b) => {
		const byPolarity = POLARITY_RANK[a.polarity] - POLARITY_RANK[b.polarity]
		if (byPolarity !== 0) return byPolarity
		const weightOf = (s: MatchSignal): number =>
			s.component ? MATCH_SCORE_WEIGHTS[s.component] : 100
		return weightOf(b) - weightOf(a)
	})
}

/**
 * Render the top displayable lines for an audience: every blocker, then up to
 * `maxSupporting` supporting/detracting/missing lines. Weak signals only fill
 * space when nothing stronger exists.
 */
export function renderMatchTrace(
	trace: Pick<MatchTrace, "signals">,
	audience: MatchTraceAudience,
	maxSupporting = 3,
): readonly string[] {
	const ordered = orderedTraceSignals(trace)
	const blockers = ordered.filter((s) => s.polarity === "blocker")
	const rest = ordered.filter((s) => s.polarity !== "blocker")
	const strong = rest.filter((s) => s.polarity !== "weak")
	const chosen = (strong.length > 0 ? strong : rest).slice(0, maxSupporting)
	return [...blockers, ...chosen].map((s) => renderMatchSignal(s, audience))
}
