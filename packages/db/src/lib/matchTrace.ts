/**
 * Match trace builder — the structured explanation layer over the ADR-040
 * engine (matchEngine.ts).
 *
 * PURE and deterministic: given the same seeker/listing inputs and clock it
 * always emits the same MatchTrace. Signals are derived from the SAME typed
 * inputs computeMatch reads, alongside its result — so an explanation can never
 * disagree with the score it explains, and a model can never invent one (the
 * no-fabrication invariant is structural). Only typed codes + primitive params
 * are emitted (G34: no sentences are ever persisted; copy renders from codes).
 */

import {
	CAP_SIGNAL_CODES,
	type MatchSignal,
	type MatchTrace,
} from "@explore-and-earn/contracts"

import {
	computeMatch,
	type MatchListingInput,
	type MatchOptions,
	type MatchSeekerInput,
} from "./matchEngine"

/* ----------------------------------------------------------------- helpers */

const norm = (values: readonly string[] | null | undefined): Set<string> => {
	const set = new Set<string>()
	for (const value of values ?? []) {
		if (typeof value === "string") {
			const trimmed = value.trim().toLowerCase()
			if (trimmed) set.add(trimmed)
		}
	}
	return set
}

const countOverlap = (
	a: readonly string[] | null | undefined,
	b: readonly string[] | null | undefined,
): { hit: number; total: number } => {
	const setA = norm(a)
	const setB = norm(b)
	let hit = 0
	for (const item of setA) if (setB.has(item)) hit++
	return { hit, total: setA.size }
}

const parseMs = (iso: string | null | undefined): number | null => {
	if (!iso) return null
	const ms = Date.parse(iso)
	return Number.isFinite(ms) ? ms : null
}

const DAY = 86_400_000

/* ---------------------------------------------------------------- builders */

function categorySignals(
	seeker: MatchSeekerInput,
	listing: MatchListingInput,
): MatchSignal[] {
	const signals: MatchSignal[] = []
	const desired = norm(seeker.desiredCategories)
	const cat = listing.category?.trim().toLowerCase() ?? null

	if (desired.size === 0 && (seeker.desiredRoles?.length ?? 0) === 0) {
		signals.push({
			code: "category_preference_missing",
			component: "categoryRoleFit",
			polarity: "missing",
		})
	} else if (cat && desired.has(cat)) {
		signals.push({
			code: "category_preferred",
			component: "categoryRoleFit",
			polarity: "positive",
			params: { category: cat },
		})
	} else if (cat === "mix" || desired.has("mix")) {
		signals.push({
			code: "category_mix_related",
			component: "categoryRoleFit",
			polarity: "weak",
		})
	} else if (cat) {
		signals.push({
			code: "category_not_preferred",
			component: "categoryRoleFit",
			polarity: "negative",
			params: { category: cat },
		})
	}

	const listingRoles = [...(listing.roles ?? []), ...(listing.tags ?? [])]
	const roles = countOverlap(seeker.desiredRoles, listingRoles)
	if (roles.hit > 0) {
		signals.push({
			code: "roles_overlap",
			component: "categoryRoleFit",
			polarity: "positive",
			params: { matched: roles.hit },
		})
	}

	const requiredSkills = listing.requiredSkillTags ?? []
	if (requiredSkills.length > 0) {
		const skills = countOverlap(requiredSkills, seeker.skillTags)
		if (skills.total > 0) {
			if (skills.hit === skills.total) {
				signals.push({
					code: "required_skills_covered",
					component: "categoryRoleFit",
					polarity: "positive",
					params: { total: skills.total },
				})
			} else if (skills.hit > 0) {
				signals.push({
					code: "required_skills_partial",
					component: "categoryRoleFit",
					polarity: "weak",
					params: { covered: skills.hit, total: skills.total },
				})
			} else {
				signals.push({
					code: "required_skills_none",
					component: "categoryRoleFit",
					polarity: "negative",
					params: { total: skills.total },
				})
			}
		}
	}

	const interests = countOverlap(seeker.interestTags, listing.tags)
	if (interests.hit > 0) {
		signals.push({
			code: "interests_overlap",
			component: "categoryRoleFit",
			polarity: "weak",
		})
	}

	return signals
}

function locationSignals(
	seeker: MatchSeekerInput,
	listing: MatchListingInput,
): MatchSignal[] {
	// Mirrors matchEngine.locationTravelFit's branch structure exactly.
	const listingRemote =
		listing.isRemote === true || listing.category?.toLowerCase() === "remote"
	const wantsRemote =
		seeker.remotePreference === "remote" ||
		seeker.locationPref === "remote" ||
		seeker.travelReadiness === "remote_only"
	const remoteOnly =
		seeker.travelReadiness === "remote_only" || seeker.remotePreference === "remote"

	if (listingRemote) {
		if (wantsRemote) {
			return [
				{
					code: "remote_matches_preference",
					component: "locationTravelFit",
					polarity: "positive",
				},
			]
		}
		if (seeker.remotePreference === "on_site") {
			return [
				{
					code: "remote_but_prefers_onsite",
					component: "locationTravelFit",
					polarity: "negative",
				},
			]
		}
		return [
			{
				code: "remote_acceptable",
				component: "locationTravelFit",
				polarity: "weak",
			},
		]
	}

	if (remoteOnly) {
		return [
			{
				code: "onsite_conflicts_remote_only",
				component: "locationTravelFit",
				polarity: "negative",
			},
		]
	}

	switch (seeker.travelReadiness) {
		case "ready_to_relocate":
		case "willing_to_travel":
		case "flexible":
			return [
				{
					code: "travel_readiness_supports",
					component: "locationTravelFit",
					polarity: "positive",
					params: { readiness: seeker.travelReadiness },
				},
			]
		case "local_only":
			return [
				{
					code: "travel_readiness_limited",
					component: "locationTravelFit",
					polarity: "negative",
					params: { readiness: "local_only" },
				},
			]
		default:
			break
	}

	// Mirrors the engine's post-switch fallback: a hybrid/any remote preference
	// scores 75 on-site (mild positive) — surfacing only "readiness unknown"
	// for a positively-scored input would misexplain the score.
	if (seeker.remotePreference === "hybrid" || seeker.remotePreference === "any") {
		return [
			{
				code: "location_flexible_preference",
				component: "locationTravelFit",
				polarity: "weak",
			},
		]
	}
	return [
		{
			code: "travel_readiness_unknown",
			component: "locationTravelFit",
			polarity: "missing",
		},
	]
}

function availabilitySignals(
	seeker: MatchSeekerInput,
	listing: MatchListingInput,
	nowMs: number,
): MatchSignal[] {
	// Mirrors matchEngine.availabilityOverlap's branch structure exactly.
	const status = seeker.availabilityStatus
	if (status === "unavailable") {
		return [
			{
				code: "seeker_unavailable",
				component: "availabilityOverlap",
				polarity: "negative",
			},
		]
	}

	const ls = parseMs(listing.beginsAt)
	const le = parseMs(listing.endsAt)
	const listingEnded = le != null && le < nowMs

	if (status === "available_now" || status === "flexible") {
		if (listingEnded) {
			return [
				{
					code: "listing_already_ended",
					component: "availabilityOverlap",
					polarity: "negative",
				},
			]
		}
		return [
			{
				code: "availability_open_now",
				component: "availabilityOverlap",
				polarity: "positive",
			},
		]
	}

	const ss = parseMs(seeker.availabilityStart)
	const se = parseMs(seeker.availabilityEnd)

	if (ls == null && le == null) {
		return [
			{
				code: "listing_dates_open",
				component: "availabilityOverlap",
				polarity: "weak",
			},
		]
	}
	if (ss == null && se == null) {
		return [
			{
				code: "availability_unknown",
				component: "availabilityOverlap",
				polarity: "missing",
			},
		]
	}

	const start = Math.max(ss ?? -Infinity, ls ?? -Infinity)
	const end = Math.min(se ?? Infinity, le ?? Infinity)
	if (!Number.isFinite(start) || !Number.isFinite(end)) {
		// An open-ended range on either side covers the season.
		return [
			{
				code: "availability_overlaps_season",
				component: "availabilityOverlap",
				polarity: "positive",
				params: {
					overlapDays:
						ls != null && le != null ? Math.max(Math.round((le - ls) / DAY), 1) : 0,
				},
			},
		]
	}

	const overlapDays = Math.max(0, (end - start) / DAY)
	if (overlapDays <= 0) {
		return [
			{
				code: "availability_no_overlap",
				component: "availabilityOverlap",
				polarity: "negative",
			},
		]
	}

	const listingDur = ls != null && le != null ? Math.max((le - ls) / DAY, 1) : null
	const frac = listingDur ? Math.min(overlapDays / listingDur, 1) : 1
	// 0.995 matches the engine's rounding (round(frac*100) === 100), so a
	// near-full overlap never renders as a "100% partial" oddity.
	if (frac >= 0.995) {
		return [
			{
				code: "availability_overlaps_season",
				component: "availabilityOverlap",
				polarity: "positive",
				params: { overlapDays: Math.round(overlapDays) },
			},
		]
	}
	return [
		{
			code: "availability_partial_overlap",
			component: "availabilityOverlap",
			polarity: frac >= 0.5 ? "positive" : "weak",
			params: { overlapPercent: Math.round(frac * 100) },
		},
	]
}

function paySignals(
	seeker: MatchSeekerInput,
	listing: MatchListingInput,
): MatchSignal[] {
	const need = seeker.payExpectationMinCents
	if (need == null || need <= 0) {
		return [
			{
				code: "pay_expectation_missing",
				component: "payAlignment",
				polarity: "missing",
			},
		]
	}
	const offer = listing.compensationMaxCents ?? listing.compensationMinCents
	if (offer == null) {
		return [
			{ code: "pay_unknown", component: "payAlignment", polarity: "missing" },
		]
	}
	if (offer >= need) {
		return [
			{
				code: "pay_meets_expectation",
				component: "payAlignment",
				polarity: "positive",
			},
		]
	}
	// The engine softens a shortfall for pay-flexible seekers (+15 sub-score);
	// the ratio stays factual, but the framing follows the seeker's own
	// flexibility rather than reading as a hard negative.
	return [
		{
			code: "pay_below_expectation",
			component: "payAlignment",
			polarity: seeker.payFlexible === true ? "weak" : "negative",
			params: { payPercent: Math.round((offer / need) * 100) },
		},
	]
}

function housingMealsSignals(
	seeker: MatchSeekerInput,
	listing: MatchListingInput,
): MatchSignal[] {
	const signals: MatchSignal[] = []
	const housingWanted =
		seeker.housingPreference === "required" || seeker.housingPreference === "preferred"

	if (seeker.housingPreference == null) {
		signals.push({
			code: "housing_needs_unknown",
			component: "housingMealsFit",
			polarity: "missing",
		})
	} else if (listing.housingIncluded === true && housingWanted) {
		signals.push({
			code: "housing_included_matches_need",
			component: "housingMealsFit",
			polarity: "positive",
		})
	} else if (listing.housingIncluded !== true && seeker.housingPreference === "preferred") {
		// The "required" case is a cap → surfaces as the blocker signal instead.
		signals.push({
			code: "housing_not_included_preferred",
			component: "housingMealsFit",
			polarity: "negative",
		})
	}

	// Mirrors the engine: once the seeker states a meals preference, the meals
	// sub-score is evaluated even when the listing leaves meals unstated (the
	// engine treats null as not-provided). An unstated listing gets an honest
	// missing-data note, never a false "not included" claim.
	const mealsWanted =
		seeker.mealsPreference === "required" || seeker.mealsPreference === "preferred"
	if (mealsWanted) {
		if (listing.mealsIncluded === true) {
			signals.push({
				code: "meals_included_matches_need",
				component: "housingMealsFit",
				polarity: "positive",
			})
		} else if (listing.mealsIncluded === false) {
			signals.push({
				code: "meals_not_included_preferred",
				component: "housingMealsFit",
				polarity: "negative",
			})
		} else {
			signals.push({
				code: "meals_unspecified_preferred",
				component: "housingMealsFit",
				polarity: "missing",
			})
		}
	}

	return signals
}

/* ------------------------------------------------------------------- trace */

/**
 * Seeker-side completeness floor under which the trace carries an explicit
 * thin-profile note. Keyed to the profileCompleteness COMPONENT (not overall
 * confidence) so a complete listing can never mask a thin seeker profile.
 */
const THIN_PROFILE_COMPLETENESS = 40

/**
 * Score one pairing AND build its full structured trace. The trace's numeric
 * fields are exactly the engine's MatchResult; `signals` is the typed evidence
 * derived from the same inputs. Pure — inject `nowMs` for reproducibility.
 */
export function buildMatchTrace(
	seeker: MatchSeekerInput,
	listing: MatchListingInput,
	options: MatchOptions = {},
): MatchTrace {
	const result = computeMatch(seeker, listing, options)

	// Excluded pairings carry no evidence — they are never scored or shown.
	if (result.excluded !== null) {
		return { ...result, signals: [] }
	}

	const nowMs = options.nowMs ?? 0
	const signals: MatchSignal[] = [
		// Blockers first — one per applied cap, always surfaced.
		...result.capsApplied.map(
			(cap): MatchSignal => ({
				code: CAP_SIGNAL_CODES[cap],
				component: null,
				polarity: "blocker",
			}),
		),
		...categorySignals(seeker, listing),
		...locationSignals(seeker, listing),
		...availabilitySignals(seeker, listing, nowMs),
		...paySignals(seeker, listing),
		...housingMealsSignals(seeker, listing),
	]

	if (result.components.profileCompleteness < THIN_PROFILE_COMPLETENESS) {
		signals.push({
			code: "profile_thin",
			component: "profileCompleteness",
			polarity: "missing",
		})
	}

	return { ...result, signals }
}
