/**
 * Unit tests for the seeker listing-detail fit helper
 * (packages/db/src/lib/seekerListingFit.ts).
 *
 * Pure/deterministic (no DB, env, or mocks): pins the adapter mapping, the
 * honest "enough signal" gate, band↔score consistency, relative ordering of an
 * aligned vs a misaligned pairing, and that the housing hard-cap surfaces so
 * the detail page can show an honest caveat.
 */
import { describe, expect, it } from "vitest";
import { MATCH_SCORE_CAPS, matchBandFor } from "@explore-and-earn/contracts";

import type { ListingRow, PublicListingDetail } from "../src/queries/listings";
import type { SeekerProfileRecord } from "../src/queries/seekerProfiles";
import {
  computeSeekerListingFit,
  scoreSeekerListingRow,
  seekerHasMatchInputs,
  toPublicListingMatchInput,
} from "../src/lib/seekerListingFit";

const NOW = Date.parse("2026-07-15T00:00:00Z");

function seeker(overrides: Partial<SeekerProfileRecord> = {}): SeekerProfileRecord {
  return {
    id: "seeker-1",
    displayName: "Ada",
    shortBio: null,
    openToStatement: null,
    locationPref: "Pacific Northwest",
    remotePreference: "on_site",
    housingPreference: "preferred",
    mealsPreference: "preferred",
    payExpectationMinCents: 250_000,
    payExpectationMaxCents: null,
    payExpectationUnit: "month",
    payFlexible: true,
    desiredCategories: ["farm"],
    desiredRoles: [],
    generalSkills: [],
    onboardingComplete: true,
    profilePhotoUrl: null,
    heroCoverUrl: null,
    seekingTimeline: null,
    relativeLocation: null,
    ...overrides,
  };
}

function listing(overrides: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return {
    id: "listing-1",
    title: "Orchard harvest crew",
    category: "farm",
    description: "Pick apples in Sonoma.",
    locationDisplay: "Sonoma, CA",
    latitude: null,
    longitude: null,
    status: "live",
    housingIncluded: true,
    mealsIncluded: true,
    compensationSummary: null,
    compensationMinCents: 300_000,
    compensationMaxCents: 400_000,
    compensationUnit: "month",
    compensationCurrency: "USD",
    timelineSummary: null,
    beginsAt: "2026-07-01T00:00:00Z",
    endsAt: "2026-09-01T00:00:00Z",
    publishedAt: "2026-06-01T00:00:00Z",
    coverPhotoUrl: null,
    galleryPhotoUrls: [],
    hostProfileId: "host-1",
    host: null,
    ...overrides,
  };
}

describe("seekerHasMatchInputs — honest gate", () => {
  it("is false for an empty profile (no categories, no prefs)", () => {
    const empty = seeker({
      desiredCategories: [],
      locationPref: null,
      remotePreference: null,
      housingPreference: null,
      mealsPreference: null,
      payExpectationMinCents: null,
    });
    expect(seekerHasMatchInputs(empty)).toBe(false);
  });

  it("is true once the seeker names a desired category", () => {
    const withCategory = seeker({
      desiredCategories: ["farm"],
      locationPref: null,
      remotePreference: null,
      housingPreference: null,
      mealsPreference: null,
      payExpectationMinCents: null,
    });
    expect(seekerHasMatchInputs(withCategory)).toBe(true);
  });
});

describe("computeSeekerListingFit", () => {
  it("scores an aligned pairing, band stays consistent with the score", () => {
    const fit = computeSeekerListingFit(seeker(), listing(), NOW);
    expect(fit.excluded).toBeNull();
    expect(Number.isInteger(fit.score)).toBe(true);
    expect(fit.score).toBeGreaterThanOrEqual(0);
    expect(fit.score).toBeLessThanOrEqual(100);
    // Band is derived from the (post-cap) score — must agree.
    expect(fit.band).toBe(matchBandFor(fit.score));
  });

  it("ranks an aligned listing above a misaligned one", () => {
    const aligned = computeSeekerListingFit(seeker(), listing(), NOW);
    const misaligned = computeSeekerListingFit(
      seeker(),
      listing({
        category: "remote",
        housingIncluded: false,
        mealsIncluded: false,
        compensationMinCents: 80_000,
        compensationMaxCents: 80_000,
        locationDisplay: "Anywhere",
      }),
      NOW,
    );
    expect(aligned.score).toBeGreaterThan(misaligned.score);
  });

  it("surfaces the housing hard-cap when housing is required but not included", () => {
    const fit = computeSeekerListingFit(
      seeker({ housingPreference: "required" }),
      listing({ housingIncluded: false }),
      NOW,
    );
    expect(fit.capsApplied).toContain("housingRequiredButNotIncluded");
    expect(fit.score).toBeLessThanOrEqual(MATCH_SCORE_CAPS.housingRequiredButNotIncluded);
  });
});

describe("toPublicListingMatchInput — adapter", () => {
  it("marks remote listings isRemote and passes triad fields through", () => {
    const input = toPublicListingMatchInput(listing({ category: "remote" }));
    expect(input.isRemote).toBe(true);
    expect(input.housingIncluded).toBe(true);
    expect(input.compensationMinCents).toBe(300_000);
    expect(input.status).toBe("live");
  });
});

/** A raw ListingRow with the SAME match-relevant values as the listing() detail. */
function listingRow(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id: "listing-1",
    host_profile_id: "host-1",
    title: "Orchard harvest crew",
    category: "farm",
    description: "Pick apples in Sonoma.",
    location_display: "Sonoma, CA",
    latitude: null,
    longitude: null,
    status: "live",
    housing_included: true,
    meals_included: true,
    housing_description: null,
    meals_description: null,
    visa_support: false,
    compensation_summary: null,
    compensation_min_cents: 300_000,
    compensation_max_cents: 400_000,
    compensation_unit: "month",
    compensation_currency: "USD",
    timeline_summary: null,
    begins_at: "2026-07-01T00:00:00Z",
    ends_at: "2026-09-01T00:00:00Z",
    published_at: "2026-06-01T00:00:00Z",
    cover_photo_url: null,
    gallery_photo_urls: [],
    host_profiles: null,
    ...overrides,
  };
}

describe("scoreSeekerListingRow — row/detail mapper parity", () => {
  /**
   * NOTE ON WHAT THIS DOES AND DOES NOT PROVE.
   *
   * This used to be titled "feed/detail consistency" and read as a guarantee
   * that a card and the listing it opens agree. It never was one: both sides of
   * the assertion go through the same reduced mappers in this module, and no
   * feed surface calls either function. It could not have detected the drift it
   * appeared to guard, and it stayed green while the two live paths differed by
   * 12 points on a realistic pairing.
   *
   * What it legitimately pins is narrower and still worth having: the row-shaped
   * and detail-shaped adapters agree with each other, so a caller can use either
   * without changing the answer. The real card-vs-page invariant is enforced in
   * apps/web/lib/listingFit.ts and its tests, by reading the stored row.
   */
  it("row-shaped and detail-shaped adapters agree (mapper parity only)", () => {
    const rowScore = scoreSeekerListingRow(seeker(), listingRow(), NOW);
    const detailScore = computeSeekerListingFit(seeker(), listing(), NOW).score;
    expect(rowScore).toBe(detailScore);
  });

  it("moves with alignment (remote/no-benefits row scores lower)", () => {
    const aligned = scoreSeekerListingRow(seeker(), listingRow(), NOW);
    const misaligned = scoreSeekerListingRow(
      seeker(),
      listingRow({
        category: "remote",
        housing_included: false,
        meals_included: false,
        compensation_min_cents: 80_000,
        compensation_max_cents: 80_000,
      }),
      NOW,
    );
    expect(aligned).toBeGreaterThan(misaligned);
  });
});
