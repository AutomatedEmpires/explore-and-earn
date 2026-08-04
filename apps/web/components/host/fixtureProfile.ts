import type {
  HostRatingSummary,
  HostReview,
  PublicHostListing,
  PublicHostProfile,
  PublicListingDetail,
} from "@explore-and-earn/db";

import { getFixtureListingDetail } from "../discovery/fixtureDetail";
import { DISCOVERY_FIXTURES } from "../discovery/fixtures";

/** Complete read model needed by the public host-profile route. */
export interface FixtureHostProfileBundle {
  readonly host: PublicHostProfile;
  readonly listings: PublicHostListing[];
  readonly ratingSummary: HostRatingSummary;
  readonly reviews: HostReview[];
}

function isFirstPartyHostFixture(
  fixture: (typeof DISCOVERY_FIXTURES)[number],
  hostId: string,
): boolean {
  return (
    fixture.host.id === hostId &&
    fixture.provenanceInfo?.provenance !== "sourced"
  );
}

function toPublicHostListing(detail: PublicListingDetail): PublicHostListing {
  return {
    id: detail.id,
    title: detail.title,
    category: detail.category,
    coverPhotoUrl: detail.coverPhotoUrl,
    locationDisplay: detail.locationDisplay,
    housingIncluded: detail.housingIncluded,
    mealsIncluded: detail.mealsIncluded,
    compensationSummary: detail.compensationSummary,
    compensationMinCents: detail.compensationMinCents,
    compensationMaxCents: detail.compensationMaxCents,
    compensationUnit: detail.compensationUnit,
    compensationCurrency: detail.compensationCurrency,
    publishedAt: detail.publishedAt,
  };
}

/**
 * Resolve a known dev-bench host without inventing a persisted identity.
 *
 * The explicit `fixture_host_*` keys live on first-party discovery fixtures.
 * They are useful only for a connected local journey; production refuses them
 * before any database query. Ratings and reviews intentionally remain empty —
 * trust evidence may only come from completed, persisted engagements.
 */
export function getFixtureHostProfileBundle(
  hostId: string,
): FixtureHostProfileBundle | null {
  if (process.env.NODE_ENV === "production") return null;

  const fixtureListings = DISCOVERY_FIXTURES.filter((fixture) =>
    isFirstPartyHostFixture(fixture, hostId),
  );
  if (fixtureListings.length === 0) return null;

  const details = fixtureListings
    .map((fixture) => getFixtureListingDetail(fixture.id))
    .filter((detail): detail is PublicListingDetail => detail !== null);
  const primaryFixture = fixtureListings[0];
  const primaryDetail = details[0];
  if (!primaryFixture || !primaryDetail) return null;

  const team = primaryDetail.team?.map((member) =>
    member.photoUrl
      ? { name: member.name, role: member.role, photoUrl: member.photoUrl }
      : { name: member.name, role: member.role },
  );

  return {
    host: {
      id: hostId,
      companyName: primaryFixture.host.name,
      hostName: null,
      tagline: primaryFixture.host.tagline ?? null,
      about: primaryFixture.host.tagline ?? null,
      primaryLocationName: primaryFixture.location || null,
      photoUrl: primaryFixture.host.logoUrl ?? null,
      websiteUrl: null,
      socialLinks: { instagram: null, twitter: null },
      categoryScopes: [...new Set(details.map((detail) => detail.category))],
      housingOfferedGenerally: details.some(
        (detail) => detail.housingIncluded,
      ),
      mealsOfferedGenerally: details.some((detail) => detail.mealsIncluded),
      verified: primaryFixture.host.verified,
      createdAt: null,
      whyWorkForUs: primaryDetail.whyWorkForUs ?? undefined,
      team,
      activities: primaryDetail.activities
        ? [...primaryDetail.activities]
        : undefined,
      perks: primaryDetail.hostPerks
        ? [...primaryDetail.hostPerks]
        : undefined,
    },
    listings: details.map(toPublicHostListing),
    ratingSummary: {
      count: 0,
      average: 0,
      housingKeptPct: null,
      mealsKeptPct: null,
      payOnTimePct: null,
    },
    reviews: [],
  };
}
