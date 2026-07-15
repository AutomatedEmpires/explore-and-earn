import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockFrom = vi.fn();
vi.mock("../src/client.js", () => ({
  anonClient: () => ({ from: mockFrom }),
  authedClient: () => ({ from: mockFrom }),
}));

import {
  projectListingPay,
  resolveListingPayDraft,
} from "@explore-and-earn/contracts";
import {
  rowToDiscoveryFields,
  type ListingRow,
  updateListing,
} from "../src/queries/listings.js";

beforeEach(() => {
  mockFrom.mockReset();
});

const baseRow: ListingRow = {
  id: "listing-1",
  host_profile_id: "host-1",
  title: "Orchard crew",
  category: "farm",
  description: null,
  location_display: "Wenatchee, WA",
  latitude: null,
  longitude: null,
  status: "live",
  housing_included: false,
  meals_included: false,
  housing_description: null,
  meals_description: null,
  visa_support: false,
  compensation_summary: null,
  compensation_min_cents: null,
  compensation_max_cents: null,
  compensation_unit: "hour",
  compensation_currency: "USD",
  timeline_summary: null,
  begins_at: null,
  ends_at: null,
  published_at: null,
  cover_photo_url: null,
  gallery_photo_urls: null,
  host_profiles: {
    company_name: "Wenatchee Orchard Co.",
    subscription_tier: null,
  },
};

describe("resolveListingPayDraft", () => {
  it("resolves submitted blanks to explicit nulls so an edit can clear old bounds", () => {
    const result = resolveListingPayDraft({
      minInput: "",
      maxInput: "  ",
      unit: "hour",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      minAmount: null,
      maxAmount: null,
      minCents: null,
      maxCents: null,
      unit: "hour",
    });
    expect(result.projection.summary).toBe("Not provided");
    expect(result.projection.provision).toBe("not_provided");
  });

  it("normalizes work exchange to no cash bounds even when stale inputs exist", () => {
    const result = resolveListingPayDraft({
      minInput: "18",
      maxInput: "24",
      unit: "exchange",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.minAmount).toBeNull();
    expect(result.value.maxAmount).toBeNull();
    expect(result.projection.summary).toBe("Work exchange");
    expect(result.projection.provision).toBe("provided");
  });

  it("rejects invalid, negative, over-precise, and reversed ranges", () => {
    expect(
      resolveListingPayDraft({ minInput: "nope", maxInput: "", unit: "hour" }),
    ).toMatchObject({ ok: false });
    expect(
      resolveListingPayDraft({ minInput: "-1", maxInput: "", unit: "hour" }),
    ).toMatchObject({ ok: false });
    expect(
      resolveListingPayDraft({ minInput: "18.999", maxInput: "", unit: "hour" }),
    ).toMatchObject({ ok: false });
    expect(
      resolveListingPayDraft({ minInput: "24", maxInput: "18", unit: "hour" }),
    ).toMatchObject({ ok: false });
  });
});

describe("projectListingPay", () => {
  it.each([
    {
      name: "range",
      input: { minCents: 1800, maxCents: 2400, unit: "hour" as const },
      summary: "$18–$24/hr",
      provision: "provided",
    },
    {
      name: "minimum only",
      input: { minCents: 1800, maxCents: null, unit: "hour" as const },
      summary: "$18/hr",
      provision: "provided",
    },
    {
      name: "maximum only",
      input: { minCents: null, maxCents: 2400, unit: "hour" as const },
      summary: "Up to $24/hr",
      provision: "provided",
    },
    {
      name: "work exchange",
      input: { minCents: 1800, maxCents: 2400, unit: "exchange" as const },
      summary: "Work exchange",
      provision: "provided",
    },
    {
      name: "blank",
      input: { minCents: null, maxCents: null, unit: "hour" as const },
      summary: "Not provided",
      provision: "not_provided",
    },
  ])("projects $name pay consistently", ({ input, summary, provision }) => {
    expect(projectListingPay({ ...input, currency: "USD" })).toMatchObject({
      summary,
      provision,
    });
  });

  it("preserves a listing's persisted currency instead of assuming USD", () => {
    const pay = projectListingPay({
      minCents: null,
      maxCents: 2400,
      unit: "hour",
      currency: "cad",
    });

    expect(pay.currency).toBe("CAD");
    expect(pay.summary).toMatch(/^Up to CA\$24\/hr$/);
  });

  it("keeps work exchange canonical even when a stale cash summary exists", () => {
    expect(
      projectListingPay({
        minCents: 1800,
        maxCents: 2400,
        unit: "exchange",
        currency: "USD",
        summary: "$18–$24/hr",
      }),
    ).toMatchObject({
      minCents: null,
      maxCents: null,
      summary: "Work exchange",
      provision: "provided",
      hasNumericPay: false,
    });
  });
});

describe("rowToDiscoveryFields pay projection", () => {
  it("keeps a max-only range visible on discovery cards", () => {
    const listing = rowToDiscoveryFields({
      ...baseRow,
      compensation_max_cents: 2400,
    });

    expect(listing.benefits.pay).toEqual({
      provision: "provided",
      summary: "Up to $24/hr",
    });
    expect(listing.payInsight).toMatchObject({ maxCents: 2400, unit: "hour" });
  });

  it("projects exchange and blank pay without stale numeric insight", () => {
    const exchange = rowToDiscoveryFields({
      ...baseRow,
      compensation_min_cents: 1800,
      compensation_max_cents: 2400,
      compensation_unit: "exchange",
    });
    const blank = rowToDiscoveryFields(baseRow);

    expect(exchange.benefits.pay).toEqual({
      provision: "provided",
      summary: "Work exchange",
    });
    expect(exchange.payInsight).toBeUndefined();
    expect(blank.benefits.pay).toEqual({
      provision: "not_provided",
      summary: "Not provided",
    });
    expect(blank.payInsight).toBeUndefined();
  });
});

describe("updateListing pay persistence", () => {
  it("writes explicit null cents when a host clears both existing bounds", async () => {
    const hostChain: Record<string, ReturnType<typeof vi.fn>> = {};
    hostChain.select = vi.fn(() => hostChain);
    hostChain.eq = vi.fn(() => hostChain);
    hostChain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "host-1" },
      error: null,
    });

    const listingChain: Record<string, ReturnType<typeof vi.fn>> = {};
    listingChain.update = vi.fn(() => listingChain);
    listingChain.eq = vi.fn(() => listingChain);
    listingChain.select = vi.fn(() => listingChain);
    listingChain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "listing-1" },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(hostChain)
      .mockReturnValueOnce(listingChain);

    const result = await updateListing("token", "user-1", "listing-1", {
      payMin: null,
      payMax: null,
      payPeriod: "hour",
    });

    expect(result).toEqual({ ok: true });
    expect(listingChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        compensation_min_cents: null,
        compensation_max_cents: null,
        compensation_unit: "hour",
      }),
    );
  });
});
