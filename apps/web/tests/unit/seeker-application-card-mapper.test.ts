import { describe, expect, it } from "vitest";

import type { SeekerApplicationListing } from "@explore-and-earn/db";

import {
  seekerApplicationListingToCardData,
  seekerApplicationListingToDiscoveryListing,
  toDiscoveryCardData,
} from "../../components/discovery/listing";

function applicationListing(
  overrides: Partial<SeekerApplicationListing> = {},
): SeekerApplicationListing {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    title: "Ski Resort Front Desk",
    category: "seasonal",
    location: "Breckenridge, Colorado",
    opportunityWindow: "Nov 2026–Apr 2027",
    status: "live",
    host: { name: "Summit Pass Hospitality", verified: true },
    benefits: {
      housing: { provision: "provided", summary: "Staff dorm room" },
      meals: { provision: "partial", summary: "Staff cafeteria" },
      pay: { provision: "provided", summary: "$19/hr + tips" },
    },
    coverImageUrl: null,
    beginsAt: "2026-11-14T17:00:00.000Z",
    endsAt: "2027-04-18T17:00:00.000Z",
    conditionalBadges: ["boosted"],
    matchScore: 88,
    ...overrides,
  };
}

describe("seeker application lifecycle card mapping", () => {
  it("preserves the canonical listing truth used by interactive lifecycle cards", () => {
    const source = applicationListing({
      coverImageUrl: "https://example.com/ski-resort.jpg",
      provenanceInfo: {
        provenance: "verified",
        claimStatus: "converted",
        benefitEvidence: {
          housing: "not_stated",
          meals: "not_stated",
          pay: "not_stated",
        },
      },
    });
    const listing = seekerApplicationListingToDiscoveryListing(source);
    const card = toDiscoveryCardData(listing);

    expect(listing).toMatchObject({
      id: source.id,
      begins: "Nov 14, 2026",
      ends: "Apr 18, 2027",
      coverImageUrl: "https://example.com/ski-resort.jpg",
      host: source.host,
      benefits: source.benefits,
      provenanceInfo: source.provenanceInfo,
      conditionalBadges: ["boosted"],
      matchScore: 88,
    });
    expect(card).not.toHaveProperty("seasonLength");
    expect(card.triad).toEqual({
      housing: "Staff dorm room",
      meals: "Staff cafeteria",
      pay: "$19/hr + tips",
    });
    expect(card.provenance).toBe("verified");
    expect(card.benefitEvidence).toEqual({
      housing: "not_stated",
      meals: "not_stated",
      pay: "not_stated",
    });
  });

  it("preserves sourced attribution and evidence without restoring verification", () => {
    const source = applicationListing({
      host: { name: "Riverbend Farms", verified: false },
      provenanceInfo: {
        provenance: "sourced",
        claimStatus: "unclaimed",
        source: {
          sourceName: "Seasonal Work Directory",
          sourceUrl: "https://jobs.example/riverbend",
          sourcePostingId: "riverbend-1",
          publishedAt: null,
          retrievedAt: "2026-08-01T17:00:00.000Z",
          employerName: "Riverbend Farms",
        },
        benefitEvidence: {
          housing: "stated",
          meals: "not_stated",
          pay: "stated",
        },
      },
    });

    const listing = seekerApplicationListingToDiscoveryListing(source);
    const card = toDiscoveryCardData(listing);

    expect(listing.provenanceInfo).toEqual(source.provenanceInfo);
    expect(listing.host).toEqual({ name: "Riverbend Farms", verified: false });
    expect(card.verifiedHost).toBe(false);
    expect(card.provenance).toBe("sourced");
    expect(card.benefitEvidence).toEqual({
      housing: "stated",
      meals: "not_stated",
      pay: "stated",
    });
  });

  it("preserves stored season dates and match truth without card-only duration copy", () => {
    const card = seekerApplicationListingToCardData(applicationListing());

    expect(card.begins).toBe("Nov 14, 2026");
    expect(card.ends).toBe("Apr 18, 2027");
    expect(card).not.toHaveProperty("seasonLength");
    expect(card.matchScore).toBe(88);
  });

  it("keeps genuinely missing dates and scores unstated", () => {
    const card = seekerApplicationListingToCardData(
      applicationListing({ beginsAt: null, endsAt: null, matchScore: undefined }),
    );

    expect(card.begins).toBeUndefined();
    expect(card.ends).toBeUndefined();
    expect(card).not.toHaveProperty("seasonLength");
    expect(card.matchScore).toBeUndefined();
  });
});
