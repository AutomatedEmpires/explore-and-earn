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
 * SCOPE — READ THIS BEFORE USING ANY EXPORT HERE.
 *
 * These mappers deliberately carry a REDUCED input set: 7 of the engine's 20
 * seeker fields and 12 of its 20 listing fields. They are not the scoring path
 * of record. The number every discovery card shows is the persisted
 * match_scores row, computed by apps/web/services/matching from ~18 seeker and
 * ~17 listing fields; the listing-detail page reads that same stored row (see
 * apps/web/lib/listingFit.ts).
 *
 * This header used to claim "ONE SOURCE OF TRUTH ... the score on a feed card
 * can never disagree with the score on the listing it opens". That was false
 * for as long as it was written: no feed surface has ever called these
 * functions. Measured on one realistic pairing, this path returned 72 where the
 * persisted path returned 84 — straddling 75, which is both the card's
 * pill threshold and the "Strong match" floor.
 *
 * So: use these for a cheap, self-contained fit estimate (the assistant's
 * explain_match) — never to render a number a user could compare against a
 * card. Anything user-facing reads the stored row.
 *
 * The visa/skill/cert engine inputs are left null here because this reduced set
 * does not carry them. Note that is a projection choice, not a schema gap:
 * seeker_profiles.visa_support_needed is a real column (051) that
 * SeekerProfileRecord's SELECT simply does not request, and certifications live
 * in seeker_certifications, which needs a join. Supplying either one WITHOUT
 * also supplying the matching listing field inverts the bug — see the note on
 * {@link fitFieldsToMatchInput}.
 */

type FitEvidence = "not_stated" | "stated" | "confirmed";

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
  /** Per-benefit evidence (sourced listings) — a not_stated benefit is
      scored as UNKNOWN, never as provided. Omitted → confirmed. */
  readonly housingEvidence?: FitEvidence;
  readonly mealsEvidence?: FitEvidence;
}

/**
 * The reduced listing→engine mapping shared by the exports in this module.
 *
 * DO NOT "fix" this by adding requiredCertifications or visaSupport on their
 * own. Both caps are asymmetric, and a one-sided fix inverts them:
 *
 *  - requiredCertificationMissing is gated FIRST on the listing array being
 *    non-empty, and overlapFraction(required, undefined) is 0, which is < 1. So
 *    supplying the listing side while the seeker's certifications stay
 *    undefined makes the cap fire for EVERY seeker. That regression has already
 *    shipped once — see apps/web/services/matching/index.ts, which loads
 *    seeker_certifications precisely because "leaving them empty unfairly
 *    capped every applicant to a cert-requiring listing".
 *  - visaSupportRequiredButUnavailable tests `seeker === true` but
 *    `listing !== true`, so supplying only the seeker side fires it on every
 *    listing this reduced mapper produces.
 *
 * Each cap needs BOTH sides in the same change, or neither.
 */
function fitFieldsToMatchInput(fields: FitListingFields): MatchListingInput {
  return {
    category: fields.category,
    housingIncluded: fields.housingIncluded,
    mealsIncluded: fields.mealsIncluded,
    housingEvidence: fields.housingEvidence ?? null,
    mealsEvidence: fields.mealsEvidence ?? null,
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
    remotePreference: profile.remotePreference,
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
    housingEvidence: listing.provenanceInfo?.benefitEvidence.housing,
    mealsEvidence: listing.provenanceInfo?.benefitEvidence.meals,
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
    // Evidence rides the row for EVERY provenance: verified-native rows are
    // 'confirmed' (a no-op for the engine), sourced rows carry stated/
    // not_stated, and a CONVERTED listing whose employer never addressed a
    // benefit legitimately keeps 'not_stated' — gating on provenance here
    // would silently turn that unknown back into a hard "not included".
    housingEvidence: row.housing_evidence,
    mealsEvidence: row.meals_evidence,
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
    profile.remotePreference != null ||
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
 * Score-only fit of a raw listing row for a seeker, from the reduced input set.
 *
 * NOT used by any feed. The docstring here used to say "so a feed card's badge
 * always agrees with the listing it opens"; the feeds read the persisted
 * match_scores row instead (queries/matchScores.ts documents the switch), and
 * this function has no production caller. It is kept because it is the honest
 * pairing for {@link computeSeekerListingFit} when a caller genuinely wants the
 * reduced-input score for a raw row — but if you are reaching for it to render
 * a user-facing number, you want the stored row instead.
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
