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

import type { PublicListingDetail } from "../src/queries/listings";
import type { SeekerProfileRecord } from "../src/queries/seekerProfiles";
import {
  computeSeekerListingFit,
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
    locationPref: "on_site",
    housingPreference: "preferred",
    mealsPreference: "preferred",
    payExpectationMinCents: 250_000,
    payExpectationMaxCents: null,
    payExpectationUnit: "month",
    payFlexible: true,
    desiredCategories: ["farm"],
    desiredRoles: [],
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
