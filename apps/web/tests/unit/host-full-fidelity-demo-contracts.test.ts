import { describe, expect, it } from "vitest";

import {
  hostDemoApplicationActions,
  hostDemoDateRangeError,
  hostDemoHourlyPaySummary,
  hostDemoListingCompleteness,
  hostDemoListings,
  hostDemoProfileCompletion,
  hostDemoPublicListingsFor,
  hostDemoSeasonLength,
} from "../../components/demo/full-fidelity/host/adapter";

describe("host full-fidelity demo truth contracts", () => {
  it("projects only canonical seeker-demo listings while honoring session edits and status", () => {
    const live = hostDemoListings.find((listing) => listing.status === "published");
    const draft = hostDemoListings.find((listing) => listing.status === "draft");
    expect(live).toBeDefined();
    expect(draft).toBeDefined();

    const projection = hostDemoPublicListingsFor([
      { ...live!, title: "Session-edited title", housing: "Not provided", housingIncluded: false },
      { ...draft!, status: "published" },
      { ...live!, id: "demo_listing_created_test", title: "Browser-only listing" },
    ]);

    expect(projection).toHaveLength(1);
    expect(projection[0]?.title).toBe("Session-edited title");
    expect(projection[0]?.housingIncluded).toBe(false);
  });

  it("keeps pay summary and stored range normalized from the same numeric truth", () => {
    expect(hostDemoHourlyPaySummary(2_000, 1_800)).toBe("$20/hr");
    expect(hostDemoHourlyPaySummary(-100, 1_800)).toBe("$0–$18/hr");
  });

  it("rejects invalid or reversed season dates before deriving a duration", () => {
    expect(hostDemoDateRangeError("2026-05-18", "2026-10-04")).toBeNull();
    expect(hostDemoDateRangeError("not-a-date", "2026-10-04")).toContain("valid");
    expect(hostDemoDateRangeError("2026-10-04", "2026-05-18")).toContain("on or after");
    expect(hostDemoSeasonLength("not-a-date", "2026-10-04")).toBe("Dates need review");
    expect(hostDemoSeasonLength("2026-10-04", "2026-05-18")).toBe("Dates need review");
  });

  it("derives listing and profile completeness from current content", () => {
    const listing = hostDemoListings[0];
    expect(listing).toBeDefined();
    expect(hostDemoListingCompleteness(listing!).score).toBe(100);
    expect(
      hostDemoListingCompleteness({
        ...listing!,
        startDate: "2026-10-04",
        endDate: "2026-05-18",
      }).missing,
    ).toContain("Season dates");

    const baseProfile = {
      tagline: "Clear headline",
      description: "Company story",
      whyWorkForUs: "Why join",
      team: "Elena | Owner",
      housing: "Shared cabin",
      transportation: "Staff shuttle",
      remoteness: "Town is nearby",
      nearbyServices: "Grocery store",
      faqs: "One | Answer\nTwo | Answer\nThree | Answer",
    };
    expect(hostDemoProfileCompletion(baseProfile)).toMatchObject({
      score: 90,
      missing: ["Add one more FAQ"],
    });
    expect(
      hostDemoProfileCompletion({ ...baseProfile, faqs: `${baseProfile.faqs}\nMalformed extra line` })
        .score,
    ).toBe(90);
    expect(
      hostDemoProfileCompletion({ ...baseProfile, faqs: `${baseProfile.faqs}\nFour | Answer` })
        .score,
    ).toBe(100);
  });

  it("keeps canonical application and listing terminal states distinct", () => {
    expect(hostDemoApplicationActions("accepted").map((action) => action.status)).toEqual([
      "active",
    ]);
    expect(hostDemoApplicationActions("active").map((action) => action.status)).toEqual([
      "completed",
    ]);
    expect(hostDemoApplicationActions("not_selected")).toEqual([]);
    expect(hostDemoApplicationActions("withdrawn").map((action) => action.status)).toEqual([]);

    const closed = hostDemoListings.find((listing) => listing.status === "closed");
    expect(closed?.lifecycle[0]?.reason).toContain("position was filled");
  });
});
