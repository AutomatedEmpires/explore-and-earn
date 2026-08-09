import { describe, expect, it } from "vitest";

import type { SeekerApplicationListing } from "@explore-and-earn/db";

import { seekerApplicationListingToCardData } from "../../components/discovery/listing";

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
    matchScore: 88,
    ...overrides,
  };
}

describe("seeker application lifecycle card mapping", () => {
  it("preserves stored season dates, duration, and match truth", () => {
    const card = seekerApplicationListingToCardData(applicationListing());

    expect(card.begins).toBe("Nov 14, 2026");
    expect(card.ends).toBe("Apr 18, 2027");
    expect(card.seasonLength).toBe("about 5 months");
    expect(card.matchScore).toBe(88);
  });

  it("keeps genuinely missing dates and scores unstated", () => {
    const card = seekerApplicationListingToCardData(
      applicationListing({ beginsAt: null, endsAt: null, matchScore: undefined }),
    );

    expect(card.begins).toBeUndefined();
    expect(card.ends).toBeUndefined();
    expect(card.seasonLength).toBeUndefined();
    expect(card.matchScore).toBeUndefined();
  });
});
