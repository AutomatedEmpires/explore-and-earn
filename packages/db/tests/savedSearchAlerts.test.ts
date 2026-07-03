/**
 * Unit tests for the pure helpers of the saved-search alert worker
 * (packages/db/src/queries/savedSearchAlerts.ts). The orchestration itself is
 * service-role I/O; these pin the deterministic logic that decides what counts
 * as a "new" match and how a saved-search filter maps onto the discovery search.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mapSavedFiltersToSearch,
  selectNewListings,
} from "../src/queries/savedSearchAlerts";
import type { ListingRow } from "../src/queries/listings";

const listingAt = (id: string, publishedAt: string | null): ListingRow =>
  ({ id, published_at: publishedAt } as unknown as ListingRow);

describe("selectNewListings", () => {
  const rows = [
    listingAt("old", "2026-01-01T00:00:00Z"),
    listingAt("new", "2026-06-01T00:00:00Z"),
    listingAt("undated", null),
  ];

  it("returns only listings published strictly after the floor", () => {
    const fresh = selectNewListings(rows, "2026-03-01T00:00:00Z");
    expect(fresh.map((r) => r.id)).toEqual(["new"]);
  });

  it("treats a null floor as nothing-new (caller uses createdAt instead)", () => {
    expect(selectNewListings(rows, null)).toEqual([]);
  });

  it("treats an invalid floor as nothing-new", () => {
    expect(selectNewListings(rows, "not-a-date")).toEqual([]);
  });

  it("excludes listings with no published_at", () => {
    const fresh = selectNewListings(rows, "2020-01-01T00:00:00Z");
    expect(fresh.map((r) => r.id)).toEqual(["old", "new"]); // undated dropped
  });
});

describe("mapSavedFiltersToSearch", () => {
  it("maps the saved-search filter shape onto SearchFilters", () => {
    const out = mapSavedFiltersToSearch({
      q: "orchard",
      category: "farm",
      housing: true,
      meals: false,
      visa: true,
      startRangeMonths: 3,
      payMin: 2000,
      payUnit: "month",
      location: "Sonoma",
    });
    expect(out.query).toBe("orchard");
    expect(out.categories).toEqual(["farm"]);
    expect(out.hasHousing).toBe(true);
    expect(out.visaSupport).toBe(true);
    expect(out.startRangeMonths).toBe(3);
    expect(out.payMin).toBe(2000);
    expect(out.location).toBe("Sonoma");
    expect(out.limit).toBeGreaterThan(0);
  });

  it("drops an unsupported startRangeMonths value", () => {
    expect(mapSavedFiltersToSearch({ startRangeMonths: 99 }).startRangeMonths).toBeUndefined();
  });

  it("omits category when none is set", () => {
    expect(mapSavedFiltersToSearch({ q: "x" }).categories).toBeUndefined();
  });
});
