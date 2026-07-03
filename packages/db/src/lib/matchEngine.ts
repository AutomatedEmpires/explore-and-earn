/**
 * Deterministic seeker↔listing matching engine (ADR-040).
 *
 * PURE: no I/O, no ML, no side-effects, fully reproducible → safe to unit-test
 * exhaustively and to run either inline or in a background recompute. It reads
 * the LOCKED weights/caps/exclusions/bands from @explore-and-earn/contracts and
 * NEVER redefines them (guardrails G31–G34). It returns numeric component scores
 * only; explanation text is derived at render time from those numbers (G34).
 *
 * Every component returns a normalized 0–100 sub-score; the weighted sum (÷100,
 * since weights sum to 100) is the raw score. Caps ceiling the score when a hard
 * requirement is unmet. Missing inputs degrade a component to a neutral partial
 * (never a silent exclusion) and lower CONFIDENCE — the separate data-quality
 * axis — so thin profiles still get matches.
 */

import {
  MATCH_CONFIDENCE_WEIGHTS,
  MATCH_SCORE_CAPS,
  MATCH_SCORE_WEIGHTS,
  matchBandFor,
  type MatchCap,
  type MatchComponentScores,
  type MatchResult,
  type MatchScoreComponent,
} from "@explore-and-earn/contracts"

/* ------------------------------------------------------------------ inputs */

/** Listing fields the engine reads. Extra/typed fields are optional & null-safe. */
export interface MatchListingInput {
  readonly category: string | null
  readonly tags?: readonly string[] | null
  readonly roles?: readonly string[] | null
  readonly requiredSkillTags?: readonly string[] | null
  readonly requiredCertifications?: readonly string[] | null
  readonly experienceLevelRequired?: string | null
  readonly seasonality?: readonly string[] | null
  readonly isRemote?: boolean | null
  readonly locationDisplay?: string | null
  readonly housingIncluded: boolean
  readonly mealsIncluded?: boolean | null
  readonly compensationMinCents: number | null
  readonly compensationMaxCents?: number | null
  readonly visaSupport?: boolean | null
  readonly beginsAt?: string | null
  readonly endsAt?: string | null
  /** Lifecycle status; anything other than "live" excludes the pairing. */
  readonly status?: string | null
  /** 0–100 listing completion (feeds confidence). */
  readonly completionScore?: number | null
}

/** Seeker fields the engine reads. Extra/typed fields are optional & null-safe. */
export interface MatchSeekerInput {
  readonly desiredCategories: readonly string[]
  readonly desiredRoles?: readonly string[] | null
  readonly skillTags?: readonly string[] | null
  readonly certifications?: readonly string[] | null
  readonly interestTags?: readonly string[] | null
  readonly experienceLevel?: string | null
  readonly housingPreference: string | null
  readonly mealsPreference?: string | null
  readonly locationPref: string | null
  readonly remotePreference?: string | null
  readonly travelReadiness?: string | null
  readonly payExpectationMinCents?: number | null
  readonly payFlexible?: boolean | null
  readonly availabilityStart?: string | null
  readonly availabilityEnd?: string | null
  readonly availabilityStatus?: string | null
  readonly visaSupportNeeded?: boolean | null
  /** 0–100 profile completeness (also feeds the completeness component). */
  readonly completionScore?: number | null
  /** 0–100 resume completion (feeds confidence). */
  readonly resumeCompletion?: number | null
  /** When true, the pairing is excluded as seeker_blocked_or_restricted. */
  readonly blockedOrRestricted?: boolean | null
}

/** Deterministic "now" injection so tests are stable and results reproducible. */
export interface MatchOptions {
  readonly nowMs?: number
}

/* ----------------------------------------------------------------- helpers */

const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, n))

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

/** Fraction of `a`'s items also present in `b` (0 when `a` is empty). */
const overlapFraction = (
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): number => {
  const setA = norm(a)
  if (setA.size === 0) return 0
  const setB = norm(b)
  let hit = 0
  for (const item of setA) if (setB.has(item)) hit++
  return hit / setA.size
}

const parseMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

const DAY = 86_400_000

/** Overlap of two [start,end] ranges in days (open ends treated generously). */
const rangeOverlapDays = (
  aStart: number | null,
  aEnd: number | null,
  bStart: number | null,
  bEnd: number | null,
): number => {
  const s = Math.max(aStart ?? -Infinity, bStart ?? -Infinity)
  const e = Math.min(aEnd ?? Infinity, bEnd ?? Infinity)
  if (!Number.isFinite(s) || !Number.isFinite(e)) return Infinity // an open range → treat as covered
  return Math.max(0, (e - s) / DAY)
}

/* -------------------------------------------------------------- components */

function categoryRoleFit(seeker: MatchSeekerInput, listing: MatchListingInput): number {
  const desired = seeker.desiredCategories ?? []
  if (desired.length === 0 && (seeker.desiredRoles?.length ?? 0) === 0) {
    return 45 // no stated preference → neutral-unknown, reflected in confidence
  }
  let score = 0
  const cat = listing.category?.trim().toLowerCase() ?? null
  const desiredSet = norm(desired)
  if (cat && desiredSet.has(cat)) score += 60
  else if (cat === "mix" || desiredSet.has("mix")) score += 30

  const listingRoles = [...(listing.roles ?? []), ...(listing.tags ?? [])]
  score += 22 * overlapFraction(seeker.desiredRoles, listingRoles)

  if ((listing.requiredSkillTags?.length ?? 0) > 0) {
    // coverage = how many of the listing's required skills the seeker has
    score += 12 * overlapFraction(listing.requiredSkillTags, seeker.skillTags)
  }
  score += 6 * overlapFraction(seeker.interestTags, listing.tags)
  return clamp(score)
}

function locationTravelFit(seeker: MatchSeekerInput, listing: MatchListingInput): number {
  const listingRemote =
    listing.isRemote === true || listing.category?.toLowerCase() === "remote"
  const wantsRemote =
    seeker.remotePreference === "remote" ||
    seeker.locationPref === "remote" ||
    seeker.travelReadiness === "remote_only"
  const remoteOnly =
    seeker.travelReadiness === "remote_only" || seeker.remotePreference === "remote"

  if (listingRemote) {
    if (wantsRemote) return 100
    if (seeker.remotePreference === "on_site") return 55
    return 85 // remote-capable listing is broadly acceptable
  }
  // On-site listing:
  if (remoteOnly) return 15
  switch (seeker.travelReadiness) {
    case "ready_to_relocate":
      return 100
    case "willing_to_travel":
      return 85
    case "flexible":
      return 80
    case "local_only":
      return 45 // distance unknowable without geo (Stage 2) → moderate
    default:
      break
  }
  if (seeker.remotePreference === "hybrid" || seeker.remotePreference === "any") return 75
  return 65 // unknown
}

interface AvailabilityEval {
  readonly score: number
  /** True when both sides have firm ranges that do not overlap at all. */
  readonly impossibleConflict: boolean
}

function availabilityOverlap(
  seeker: MatchSeekerInput,
  listing: MatchListingInput,
  nowMs: number,
): AvailabilityEval {
  const status = seeker.availabilityStatus
  if (status === "unavailable") return { score: 0, impossibleConflict: false }

  const ls = parseMs(listing.beginsAt)
  const le = parseMs(listing.endsAt)
  const listingEnded = le != null && le < nowMs

  if (status === "available_now" || status === "flexible") {
    return { score: listingEnded ? 20 : 90, impossibleConflict: false }
  }

  const ss = parseMs(seeker.availabilityStart)
  const se = parseMs(seeker.availabilityEnd)

  // Listing with no dates (open seasonal window) → neutral-high.
  if (ls == null && le == null) return { score: 70, impossibleConflict: false }
  // Seeker with no stated window → unknown neutral.
  if (ss == null && se == null) return { score: 65, impossibleConflict: false }

  const overlap = rangeOverlapDays(ss, se, ls, le)
  const listingDur = ls != null && le != null ? Math.max((le - ls) / DAY, 1) : null

  if (!Number.isFinite(overlap)) return { score: 85, impossibleConflict: false } // an open end covers it
  if (overlap <= 0) return { score: 0, impossibleConflict: true }
  const frac = listingDur ? clamp(overlap / listingDur, 0, 1) : 1
  return { score: Math.round(frac * 100), impossibleConflict: false }
}

function payAlignment(seeker: MatchSeekerInput, listing: MatchListingInput): number {
  const need = seeker.payExpectationMinCents
  if (need == null || need <= 0) return 70 // no stated constraint → neutral-positive
  const offer = listing.compensationMaxCents ?? listing.compensationMinCents
  if (offer == null) return 55 // unknown pay → slightly below neutral
  if (offer >= need) return 100
  let score = clamp((offer / need) * 100, 0, 95)
  if (seeker.payFlexible) score = clamp(score + 15, 0, 95)
  return Math.round(score)
}

function fitScore(pref: string | null | undefined, provided: boolean): number {
  switch (pref) {
    case "required":
      return provided ? 100 : 0
    case "preferred":
      return provided ? 100 : 55
    case "flexible":
      return provided ? 100 : 80
    case "not_needed":
      return 100 // need trivially met
    default:
      return provided ? 90 : 70 // unknown pref: mild preference for provided
  }
}

function housingMealsFit(seeker: MatchSeekerInput, listing: MatchListingInput): number {
  const h = fitScore(seeker.housingPreference, listing.housingIncluded === true)
  if (seeker.mealsPreference == null && listing.mealsIncluded == null) return h
  const m = fitScore(seeker.mealsPreference, listing.mealsIncluded === true)
  return Math.round(h * 0.7 + m * 0.3)
}

function profileCompleteness(seeker: MatchSeekerInput): number {
  if (seeker.completionScore != null) return clamp(seeker.completionScore)
  const filled = [
    (seeker.desiredCategories?.length ?? 0) > 0,
    seeker.housingPreference != null,
    seeker.locationPref != null,
    seeker.payExpectationMinCents != null,
    seeker.availabilityStatus != null,
    (seeker.skillTags?.length ?? 0) > 0,
  ]
  return Math.round((100 * filled.filter(Boolean).length) / filled.length)
}

/* -------------------------------------------------------------- confidence */

function computeConfidence(
  seeker: MatchSeekerInput,
  listing: MatchListingInput,
): number {
  const structuredSeeker = [
    (seeker.skillTags?.length ?? 0) > 0,
    (seeker.certifications?.length ?? 0) > 0,
    (seeker.interestTags?.length ?? 0) > 0,
  ]
  const relevanceExt = [
    (listing.requiredSkillTags?.length ?? 0) > 0,
    (listing.seasonality?.length ?? 0) > 0,
    listing.experienceLevelRequired != null,
  ]
  const sub = {
    seekerResumeCompletion: seeker.resumeCompletion ?? seeker.completionScore ?? 40,
    listingCompletion: listing.completionScore ?? 60,
    relevanceExtensionCompletion:
      (100 * relevanceExt.filter(Boolean).length) / relevanceExt.length,
    structuredSkillsCertsTags:
      (100 * structuredSeeker.filter(Boolean).length) / structuredSeeker.length,
    hostProfileTrustMedia: 60, // not available to the pure engine → neutral
    recencyActivityFreshness: 60, // ditto (service can enrich later)
  }
  let total = 0
  for (const key of Object.keys(MATCH_CONFIDENCE_WEIGHTS) as Array<
    keyof typeof MATCH_CONFIDENCE_WEIGHTS
  >) {
    total += clamp(sub[key]) * MATCH_CONFIDENCE_WEIGHTS[key]
  }
  return Math.round(total / 100)
}

/* ------------------------------------------------------------------ engine */

/**
 * Score one seeker against one listing. Returns the full {@link MatchResult}
 * (excluded / score / rawScore / band / confidence / components / capsApplied).
 */
export function computeMatch(
  seeker: MatchSeekerInput,
  listing: MatchListingInput,
  options: MatchOptions = {},
): MatchResult {
  const emptyComponents: MatchComponentScores = {
    categoryRoleFit: 0,
    locationTravelFit: 0,
    availabilityOverlap: 0,
    payAlignment: 0,
    housingMealsFit: 0,
    profileCompleteness: 0,
  }

  // --- Exclusions (never scored/shown) ---
  const status = listing.status?.toLowerCase()
  if (status && status !== "live") {
    const excluded =
      status === "archived" || status === "closed"
        ? "listing_closed_or_archived"
        : "listing_not_live"
    return {
      excluded,
      score: 0,
      rawScore: 0,
      band: "needs_attention",
      confidence: 0,
      components: emptyComponents,
      capsApplied: [],
    }
  }
  if (seeker.blockedOrRestricted === true) {
    return {
      excluded: "seeker_blocked_or_restricted",
      score: 0,
      rawScore: 0,
      band: "needs_attention",
      confidence: 0,
      components: emptyComponents,
      capsApplied: [],
    }
  }

  const nowMs = options.nowMs ?? 0 // caller injects; 0 = epoch (past) if omitted
  const availability = availabilityOverlap(seeker, listing, nowMs)

  const components: MatchComponentScores = {
    categoryRoleFit: Math.round(categoryRoleFit(seeker, listing)),
    locationTravelFit: Math.round(locationTravelFit(seeker, listing)),
    availabilityOverlap: availability.score,
    payAlignment: payAlignment(seeker, listing),
    housingMealsFit: housingMealsFit(seeker, listing),
    profileCompleteness: profileCompleteness(seeker),
  }

  // --- Weighted sum (weights sum to 100 → ÷100 yields 0–100) ---
  let weighted = 0
  for (const key of Object.keys(MATCH_SCORE_WEIGHTS) as MatchScoreComponent[]) {
    weighted += components[key] * MATCH_SCORE_WEIGHTS[key]
  }
  const rawScore = Math.round(weighted / 100)

  // --- Caps (ceilings for unmet hard requirements) ---
  const capsApplied: MatchCap[] = []
  if (
    (listing.requiredCertifications?.length ?? 0) > 0 &&
    overlapFraction(listing.requiredCertifications, seeker.certifications) < 1
  ) {
    capsApplied.push("requiredCertificationMissing")
  }
  if (availability.impossibleConflict) {
    capsApplied.push("impossibleTimelineConflict")
  }
  if (seeker.housingPreference === "required" && listing.housingIncluded !== true) {
    capsApplied.push("housingRequiredButNotIncluded")
  }
  if (seeker.visaSupportNeeded === true && listing.visaSupport !== true) {
    capsApplied.push("visaSupportRequiredButUnavailable")
  }

  const ceiling = capsApplied.reduce(
    (min, cap) => Math.min(min, MATCH_SCORE_CAPS[cap]),
    100,
  )
  const score = Math.min(rawScore, ceiling)

  return {
    excluded: null,
    score,
    rawScore,
    band: matchBandFor(score),
    confidence: computeConfidence(seeker, listing),
    components,
    capsApplied,
  }
}
