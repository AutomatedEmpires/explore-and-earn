/**
 * Back-compat shim over the ADR-040 matching engine.
 *
 * `scoreListingForSeeker` keeps its original narrow signature so existing callers
 * (getMatchedListings, etc.) upgrade to the real engine with zero changes. For
 * the full explainable result (band, confidence, component breakdown, caps),
 * call {@link computeMatch} from ./matchEngine directly.
 */

import { computeMatch, type MatchListingInput, type MatchSeekerInput } from "./matchEngine"

/** Listing fields required for the legacy score-only call. */
export interface ScorableListing {
  readonly category: string
  readonly housingIncluded: boolean
  readonly compensationMinCents: number | null
  readonly locationDisplay: string | null
}

/** Seeker profile fields required for the legacy score-only call. */
export interface ScorableSeekerProfile {
  readonly desiredCategories: readonly string[]
  readonly housingPreference: string | null
  readonly locationPref: string | null
  /** Minimum pay expectation in MAJOR currency units (e.g. dollars). */
  readonly payExpectationMin?: number | null
}

/** Listings scoring below this threshold are hidden from the /seek match feed. */
export const MATCH_SCORE_HIDE_THRESHOLD = 20

/**
 * Compute a 0–100 match score for a listing against a seeker profile.
 *
 * Thin adapter: maps the legacy narrow inputs onto the full engine and returns
 * only the (post-caps) score. The richer signals the engine can use
 * (availability, certs, travel readiness, etc.) are simply absent here and
 * degrade to neutral partials — callers that have them should use computeMatch.
 */
export function scoreListingForSeeker(
  listing: ScorableListing,
  seeker: ScorableSeekerProfile,
): number {
  const listingInput: MatchListingInput = {
    category: listing.category,
    locationDisplay: listing.locationDisplay,
    housingIncluded: listing.housingIncluded,
    compensationMinCents: listing.compensationMinCents,
  }
  const seekerInput: MatchSeekerInput = {
    desiredCategories: seeker.desiredCategories,
    housingPreference: seeker.housingPreference,
    locationPref: seeker.locationPref,
    payExpectationMinCents:
      seeker.payExpectationMin != null ? Math.round(seeker.payExpectationMin * 100) : null,
  }
  return computeMatch(seekerInput, listingInput).score
}
