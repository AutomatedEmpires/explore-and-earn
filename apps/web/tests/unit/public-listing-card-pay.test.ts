/**
 * Pay on the anonymous, crawlable host profile.
 *
 * The founder's 2026-07-26 pay-display decision moved into
 * `formatCompensation`: a lone floor reads "From $x", a lone ceiling reads
 * "Up to $x", both read as a range, and silence reads "Not stated" — never a
 * friendlier stand-in, because a stand-in turns an empty column into a claim.
 *
 * PublicListingCard never got the memo. It derived pay inline, so on /host/[id]
 * — the surface an anonymous visitor and a search-engine crawler see — a floor
 * printed as a bare "$1,500" (a figure, not a floor), a ceiling-only listing was
 * ignored entirely because the branch only looked at `compensationMinCents`, and
 * an unstated pay printed "See listing". A sourced listing whose origin never
 * stated pay reaches this surface, so that last case is not hypothetical.
 *
 * These assert the STRING the card is handed. Reverting the delegation puts the
 * inline derivation back and every case below changes.
 */
import { describe, expect, it } from "vitest";

// DEFAULT_CURRENCY rather than a literal: the G52 ratchet allowlists exactly
// two homes for a currency code, and a test fixture is not one of them.
import { DEFAULT_CURRENCY, NOT_STATED_LABEL } from "@explore-and-earn/contracts";
import type { PublicHostListing } from "@explore-and-earn/db";

import {
  publicListingPayProvision,
  publicListingPaySummary,
} from "../../components/host/publicListingCardModel";

function listing(over: Partial<PublicHostListing> = {}): PublicHostListing {
  return {
    id: "listing-1",
    title: "Deckhand",
    category: "maritime",
    coverPhotoUrl: null,
    locationDisplay: "Ketchikan, AK",
    housingIncluded: true,
    mealsIncluded: true,
    compensationSummary: null,
    compensationMinCents: null,
    compensationMaxCents: null,
    compensationUnit: null,
    compensationCurrency: DEFAULT_CURRENCY,
    publishedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("publicListingPaySummary", () => {
  it("reads a lone floor as a floor", () => {
    expect(publicListingPaySummary(listing({ compensationMinCents: 150000 }))).toBe(
      "From $1,500",
    );
  });

  /** The case the inline derivation could not express at all. */
  it("reads a lone ceiling as a ceiling instead of losing it", () => {
    const summary = publicListingPaySummary(
      listing({ compensationMaxCents: 150000 }),
    );
    expect(summary).toBe("Up to $1,500");
    expect(summary).not.toBe("See listing");
  });

  it("reads a range as a range", () => {
    expect(
      publicListingPaySummary(
        listing({ compensationMinCents: 120000, compensationMaxCents: 150000 }),
      ),
    ).toBe("$1,200–$1,500");
  });

  it("does not prefix an exact figure with 'From'", () => {
    expect(
      publicListingPaySummary(
        listing({ compensationMinCents: 150000, compensationMaxCents: 150000 }),
      ),
    ).toBe("$1,500");
  });

  /**
   * The invention this removes. "See listing" told a seeker there was something
   * to see; the column was empty.
   */
  it("says nothing was stated rather than inventing a next step", () => {
    const summary = publicListingPaySummary(listing());
    expect(summary).toBe(NOT_STATED_LABEL);
    expect(summary).not.toMatch(/see listing/i);
  });

  it("keeps the host's own wording when they wrote one", () => {
    expect(
      publicListingPaySummary(
        listing({ compensationSummary: "$22/hr plus tips", compensationMinCents: 1 }),
      ),
    ).toBe("$22/hr plus tips");
  });

  it("appends a cash unit and drops a non-cash one", () => {
    expect(
      publicListingPaySummary(
        listing({ compensationMinCents: 2200, compensationUnit: "hour" }),
      ),
    ).toBe("From $22/hour");
    expect(
      publicListingPaySummary(
        listing({ compensationMinCents: 2200, compensationUnit: "exchange" }),
      ),
    ).toBe("From $22");
  });
});

describe("publicListingPayProvision", () => {
  it("does not claim pay is provided when nothing was stated", () => {
    expect(publicListingPayProvision(listing())).toBe("not_stated");
  });

  it("reports provided once a figure exists", () => {
    expect(
      publicListingPayProvision(listing({ compensationMinCents: 150000 })),
    ).toBe("provided");
    expect(
      publicListingPayProvision(listing({ compensationMaxCents: 150000 })),
    ).toBe("provided");
    expect(
      publicListingPayProvision(listing({ compensationSummary: "Weekly stipend" })),
    ).toBe("provided");
  });

  /** The two must not be able to disagree. */
  it("agrees with the string the card renders", () => {
    for (const l of [
      listing(),
      listing({ compensationMinCents: 150000 }),
      listing({ compensationMaxCents: 150000 }),
      listing({ compensationSummary: "Negotiated per season" }),
    ]) {
      const stated = publicListingPaySummary(l) !== NOT_STATED_LABEL;
      expect(publicListingPayProvision(l)).toBe(stated ? "provided" : "not_stated");
    }
  });
});
