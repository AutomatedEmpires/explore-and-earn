import type { MatchResult, MatchTrace } from "@explore-and-earn/contracts";

import type { ListingRow, PublicListingDetail } from "../queries/listings";
import type { SeekerProfileRecord } from "../queries/seekerProfiles";
import { computeMatch, type MatchListingInput, type MatchSeekerInput } from "./matchEngine";
import { buildMatchTrace } from "./matchTrace";

/**
 * Seeker-facing fit computation for one listing.
 *
 * Pure & deterministic: adapts a listing + the seeker's own profile into the
 * ADR-040 engine inputs. The listing-detail page uses the full {@link MatchResult}
 * (band, score, components, caps); the /seek + /search feeds use the score only.
 *
 * ONE SOURCE OF TRUTH: every surface funnels through {@link toSeekerMatchInput}
 * and {@link fitFieldsToMatchInput}, so a listing's fit is identical on the
 * card, on the detail page, and in the assistant's explain_match — the score on
 * a feed card can never disagree with the score on the listing it opens.
 *
 * Note: the visa/skill/cert engine inputs are intentionally left null (not in
 * the seeker profile record / the public SELECT), matching the assistant.
 */

/** The listing fields the seeker-facing fit reads — source-shape-agnostic. */
interface FitListingFields {
  readonly category: string | null;
  readonly housingIncluded: boolean;
  readonly mealsIncluded: boolean | null;
  readonly compensationMinCents: number | null;
  readonly compensationMaxCents: number | null;
  readonly locationDisplay: string | null;
  readonly beginsAt: string | null;
  readonly endsAt: string | null;
  readonly status: string | null;
}

/** The single listing→engine mapping every surface shares (no drift possible). */
function fitFieldsToMatchInput(fields: FitListingFields): MatchListingInput {
  return {
    category: fields.category,
    housingIncluded: fields.housingIncluded,
    mealsIncluded: fields.mealsIncluded,
    compensationMinCents: fields.compensationMinCents,
    compensationMaxCents: fields.compensationMaxCents,
    isRemote: fields.category === "remote",
    locationDisplay: fields.locationDisplay,
    beginsAt: fields.beginsAt,
    endsAt: fields.endsAt,
    status: fields.status,
  };
}

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

/** Map a public listing detail (camelCase view shape) to the engine's input. */
export function toPublicListingMatchInput(listing: PublicListingDetail): MatchListingInput {
  return fitFieldsToMatchInput({
    category: listing.category,
    housingIncluded: listing.housingIncluded,
    mealsIncluded: listing.mealsIncluded,
    compensationMinCents: listing.compensationMinCents,
    compensationMaxCents: listing.compensationMaxCents,
    locationDisplay: listing.locationDisplay,
    beginsAt: listing.beginsAt,
    endsAt: listing.endsAt,
    status: listing.status,
  });
}

/** Map a raw listing row (snake_case DB shape, from searchListings) to the input. */
export function toListingRowMatchInput(row: ListingRow): MatchListingInput {
  return fitFieldsToMatchInput({
    category: row.category,
    housingIncluded: row.housing_included,
    mealsIncluded: row.meals_included,
    compensationMinCents: row.compensation_min_cents,
    compensationMaxCents: row.compensation_max_cents,
    locationDisplay: row.location_display,
    beginsAt: row.begins_at,
    endsAt: row.ends_at,
    status: row.status,
  });
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

/** Compute the full ADR-040 fit of one listing for one seeker (detail page). */
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

/**
 * Fit + structured explanation trace for one listing (the "Why this fits"
 * surface). Same inputs and mapping as {@link computeSeekerListingFit}, so the
 * explanation can never disagree with the score shown anywhere else. Render
 * copy with renderMatchTrace()/renderMatchSignal() from contracts (G34).
 */
export function computeSeekerListingFitTrace(
  profile: SeekerProfileRecord,
  listing: PublicListingDetail,
  nowMs?: number,
): MatchTrace {
  return buildMatchTrace(
    toSeekerMatchInput(profile),
    toPublicListingMatchInput(listing),
    nowMs !== undefined ? { nowMs } : {},
  );
}

/**
 * Score-only fit of a raw listing row for a seeker (the /seek + /search feeds).
 * Returns the same post-cap 0–100 score {@link computeSeekerListingFit} would —
 * so a feed card's badge always agrees with the listing it opens.
 */
export function scoreSeekerListingRow(
  profile: SeekerProfileRecord,
  row: ListingRow,
  nowMs?: number,
): number {
  return computeMatch(
    toSeekerMatchInput(profile),
    toListingRowMatchInput(row),
    nowMs !== undefined ? { nowMs } : {},
  ).score;
}
