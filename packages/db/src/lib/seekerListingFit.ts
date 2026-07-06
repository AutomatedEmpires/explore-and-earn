import type { MatchResult } from "@explore-and-earn/contracts";

import type { PublicListingDetail } from "../queries/listings";
import type { SeekerProfileRecord } from "../queries/seekerProfiles";
import { computeMatch, type MatchListingInput, type MatchSeekerInput } from "./matchEngine";

/**
 * Seeker-facing fit computation for a SINGLE listing on the public detail page.
 *
 * Pure & deterministic: adapts the public listing + the seeker's own profile
 * into the ADR-040 engine inputs and returns the full {@link MatchResult}
 * (band, score, components, caps). This is the same engine and the same
 * mapping the assistant's explain_match uses — one source of truth for "how
 * well does this fit me", so the detail page never drifts from the assistant or
 * the persisted match_scores.
 *
 * Note: PublicListingDetail intentionally omits visa/skill/cert fields (not in
 * the anon SELECT), so those optional inputs are left null — matching the
 * assistant's behaviour exactly. Bands stay correct for the common case.
 */

/** Map the seeker's profile record to the engine's seeker input. */
export function toSeekerMatchInput(profile: SeekerProfileRecord): MatchSeekerInput {
  return {
    desiredCategories: profile.desiredCategories ?? [],
    desiredRoles: profile.desiredRoles ?? [],
    housingPreference: profile.housingPreference,
    mealsPreference: profile.mealsPreference,
    locationPref: profile.locationPref,
    payExpectationMinCents: profile.payExpectationMinCents,
    payFlexible: profile.payFlexible,
  };
}

/** Map a public listing detail to the engine's listing input. */
export function toPublicListingMatchInput(listing: PublicListingDetail): MatchListingInput {
  return {
    category: listing.category,
    housingIncluded: listing.housingIncluded,
    mealsIncluded: listing.mealsIncluded,
    compensationMinCents: listing.compensationMinCents,
    compensationMaxCents: listing.compensationMaxCents,
    isRemote: listing.category === "remote",
    locationDisplay: listing.locationDisplay,
    beginsAt: listing.beginsAt,
    endsAt: listing.endsAt,
    status: listing.status,
  };
}

/**
 * Whether the seeker has provided enough signal for a meaningful fit. An empty
 * profile would score low — but that reflects missing DATA, not a poor listing,
 * so the UI should prompt profile completion instead of showing a misleading
 * band. This is the honest gate for surfacing a computed fit.
 */
export function seekerHasMatchInputs(profile: SeekerProfileRecord): boolean {
  return (
    (profile.desiredCategories?.length ?? 0) > 0 ||
    profile.locationPref != null ||
    profile.housingPreference != null ||
    profile.mealsPreference != null ||
    profile.payExpectationMinCents != null
  );
}

/** Compute the full ADR-040 fit of one listing for one seeker. */
export function computeSeekerListingFit(
  profile: SeekerProfileRecord,
  listing: PublicListingDetail,
  nowMs?: number,
): MatchResult {
  return computeMatch(
    toSeekerMatchInput(profile),
    toPublicListingMatchInput(listing),
    nowMs !== undefined ? { nowMs } : {},
  );
}
