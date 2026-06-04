// Matching, Ranking & Boost Configuration (contract mirror)
// MIRRORS three locked Notion canon pages:
//   - Architecture Decision Log — ADR-040 (Match Score Weights, V1). LOCKED, and
//     the drift-lock authority for the match-score component weights.
//   - "Exact Ranking, Matching & Boost Formula Specification".
//   - "Discovery, Boost & Feed Formula — Exact V1 Ranking Rules".
//
// CONFIG ONLY. There is intentionally NO scoring engine in this file — the
// consuming matching service stays gated by A-MATCH-DEPLOY (issue #46). Weights
// are tunable without a schema change (ADR-040). Explanation text is NEVER
// stored (G34): the engine surfaces the top contributing components at render
// time from these keys; it does not persist sentences.
//
// Guardrails this file backs: G31 (match-score weights sum to 100), G32
// (sub-weights), G33 (bands ordered), G34 (no stored explanation text).
// Monetization affects EXPOSURE ONLY and is excluded from match score
// (ADR-007 / G8).

/* ============================================================= MATCH SCORE */
// ADR-040 (LOCKED). Six explainable components; integer weights summing to 100.
//
// ⚠️ DRIFT FLAGGED: the "Exact Ranking, Matching & Boost Formula Specification"
// page lists an alternative EIGHT-component table (it adds Skills/Certifications
// and a Behavioral-reliability signal and re-splits the others). ADR-040 is the
// drift-lock authority ("every other page MUST match"), so it governs here. The
// 8-component variant is surfaced for founder re-ratification before any
// production tuning — see issue #46.
export const MATCH_SCORE_WEIGHTS = {
  categoryRoleFit: 30,
  locationTravelFit: 20,
  availabilityOverlap: 20,
  payAlignment: 15,
  housingMealsFit: 10,
  profileCompleteness: 5,
} as const
export type MatchScoreComponent = keyof typeof MATCH_SCORE_WEIGHTS

// Hard modifiers applied AFTER the raw 0-100 score. These are CAPS (ceilings),
// never bonuses.
export const MATCH_SCORE_CAPS = {
  requiredCertificationMissing: 60,
  impossibleTimelineConflict: 50,
  housingRequiredButNotIncluded: 65,
  visaSupportRequiredButUnavailable: 50,
} as const

// A candidate pairing is EXCLUDED (never scored or shown) when any holds.
export const MATCH_EXCLUSIONS = [
  "listing_not_live",
  "seeker_blocked_or_restricted",
  "host_banned_or_suspended",
  "listing_closed_or_archived",
] as const
export type MatchExclusion = (typeof MATCH_EXCLUSIONS)[number]

/* ======================================================== MATCH CONFIDENCE */
// Confidence (0-100) is distinct from the match score; integer weights sum 100.
export const MATCH_CONFIDENCE_WEIGHTS = {
  seekerResumeCompletion: 25,
  listingCompletion: 25,
  relevanceExtensionCompletion: 15,
  structuredSkillsCertsTags: 15,
  hostProfileTrustMedia: 10,
  recencyActivityFreshness: 10,
} as const

/* ============================================================= MATCH BANDS */
// Labels are canon (issue #46). Ordered best -> worst by descending floor (G33).
// Score floors are PROVISIONAL tunable defaults — TODO(founder): confirm cutoffs.
// Bands carry NO stored explanation text (G34).
export const MATCH_BANDS = [
  { id: "strong", label: "Strong match", minScore: 75 },
  { id: "developing", label: "Developing match", minScore: 50 },
  { id: "needs_attention", label: "Needs attention", minScore: 0 },
] as const
export type MatchBand = (typeof MATCH_BANDS)[number]["id"]

/**
 * Pure band lookup (NOT the matching algorithm). Returns the highest band whose
 * floor the score meets. Presentation helper only.
 */
export function matchBandFor(score: number): MatchBand {
  for (const band of MATCH_BANDS) {
    if (score >= band.minScore) return band.id
  }
  return "needs_attention"
}

/* ========================================================= DISCOVERY RANKING */
// display_score = sum(componentScore[0..100] * weight). Weights sum to 1.00.
// Monetization is EXPOSURE ONLY (ADR-007). Agreed across both formula pages and
// the Backend Build Pack.
export const DISCOVERY_RANKING_WEIGHTS = {
  relevance: 0.4,
  listingQuality: 0.15,
  freshness: 0.1,
  engagementQuality: 0.1,
  monetizationExposure: 0.15,
  diversity: 0.1,
} as const

// Freshness sub-score (0-100) by age since publish/update, in days. First match
// wins (ascending maxAgeDays).
export const FRESHNESS_SCORE_BY_AGE = [
  { maxAgeDays: 7, score: 100 },
  { maxAgeDays: 30, score: 75 },
  { maxAgeDays: 60, score: 45 },
  { maxAgeDays: 90, score: 25 },
  { maxAgeDays: Number.POSITIVE_INFINITY, score: 10 },
] as const

/* =================================================================== BOOST */
// Boost adds monetization exposure, never match score (ADR-007 / G8).
export const BOOST_DENSITY = {
  targetShare: 0.2,
  minShare: 0.15,
  maxShare: 0.25,
  // At most `maxBoostedPerWindow` boosted listings per `windowSize`-card window.
  maxBoostedPerWindow: 1,
  windowSize: 4,
} as const

// Sparse-pool overrides keyed by eligible ORGANIC pool size (first match wins).
export const BOOST_SPARSE_POOL_CAPS = [
  { maxPool: 9, maxShare: 0.1 },
  { maxPool: 25, maxShare: 0.15 },
  { maxPool: Number.POSITIVE_INFINITY, maxShare: 0.25 },
] as const

// A boosted listing must clear at least one relevance test before insertion;
// this is the authenticated-seeker match-score floor.
export const BOOST_MIN_AUTHENTICATED_MATCH_SCORE = 50

// Monetization priority sub-score (0-100) by campaign delivery state.
export const BOOST_PRIORITY_BY_DELIVERY = {
  relevant_under_delivered: 100,
  relevant_on_track: 70,
  relevant_over_delivered: 40,
  not_boosted: 0,
} as const
export type BoostDeliveryState = keyof typeof BOOST_PRIORITY_BY_DELIVERY

/* ======================================================= FEATURED EMPLOYER */
export const FEATURED_RAIL = {
  targetActiveCampaignsPerScope: 24,
  weights: {
    categoryScopeRelevance: 0.3,
    underDelivery: 0.3,
    hostProfileQuality: 0.2,
    freshnessRandomization: 0.1,
    diversity: 0.1,
  },
} as const

/* ===================================================================== MAP */
export const MAP_DRAWER_WEIGHTS = {
  viewportRelevance: 0.3,
  matchOrFilterRelevance: 0.3,
  boostPriority: 0.15,
  listingQuality: 0.15,
  freshnessDiversity: 0.1,
} as const

export const MAP_VIEWPORT_CAPS = {
  maxRawPins: 250,
  maxDrawerCardsInitial: 50,
} as const

/* ========================================================== COMMUNITY FEED */
// Canonical V1 10-item target mix.
export const FEED_TARGET_MIX = {
  seekerPhotos: 5,
  hostAnnouncements: 2,
  listingOrBoosted: 1,
  platformPost: 1,
  flexibleRelevance: 1,
} as const
