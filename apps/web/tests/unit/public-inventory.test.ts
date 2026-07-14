/**
 * Public agent surface tests (services/publicInventory) — validation
 * rejection, cursor behavior, pagination, and the PII boundary: the DTO key
 * sets are pinned so a private field can never leak into the public API/MCP
 * without failing the build.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockDb = {
  searchListings: vi.fn(),
  getPublicListingById: vi.fn(),
  getPublicHostProfile: vi.fn(),
  getPublicListingsByHost: vi.fn(),
};

vi.mock("@explore-and-earn/db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@explore-and-earn/db");
  return {
    ...actual,
    searchListings: (...args: unknown[]) => mockDb.searchListings(...args),
    getPublicListingById: (...args: unknown[]) => mockDb.getPublicListingById(...args),
    getPublicHostProfile: (...args: unknown[]) => mockDb.getPublicHostProfile(...args),
    getPublicListingsByHost: (...args: unknown[]) => mockDb.getPublicListingsByHost(...args),
  };
});

import {
  getPublicListingV1,
  getPublicOrganizationV1,
  searchPublicListings,
  validatePublicListingQuery,
} from "../../services/publicInventory";
import { decodePublicCursor, encodePublicCursor } from "@explore-and-earn/contracts";

/** A realistic raw row INCLUDING private-ish fields that must never map out. */
const rawRow = {
  id: "11111111-2222-3333-4444-555555555555",
  host_profile_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  title: "Orchard crew",
  category: "farm" as const,
  description: "Pick apples all fall.",
  location_display: "Hood River, OR",
  latitude: 45.7,
  longitude: -121.5,
  status: "live",
  housing_included: true,
  meals_included: false,
  housing_description: "Shared bunkhouse",
  meals_description: null,
  visa_support: false,
  compensation_summary: "$18/hr",
  compensation_min_cents: 180000,
  compensation_max_cents: null,
  compensation_unit: "hour",
  compensation_currency: "USD",
  timeline_summary: null,
  begins_at: "2026-09-01T00:00:00Z",
  ends_at: "2026-11-15T00:00:00Z",
  published_at: "2026-07-01T00:00:00Z",
  cover_photo_url: "https://img.example/cover.jpg",
  gallery_photo_urls: ["https://img.example/1.jpg"],
  host_profiles: { company_name: "Sunrise Orchards", subscription_tier: "professional" },
};

beforeEach(() => {
  for (const fn of Object.values(mockDb)) fn.mockReset();
});

describe("validatePublicListingQuery — reject, never guess", () => {
  it("accepts a full valid query", () => {
    const result = validatePublicListingQuery({
      query: "apples",
      category: "farm",
      housing: "true",
      minPay: "15",
      minLat: "44",
      maxLat: "46",
      minLng: "-122",
      maxLng: "-120",
      limit: "10",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe("farm");
      expect(result.value.bounds).toEqual({ minLat: 44, maxLat: 46, minLng: -122, maxLng: -120 });
      expect(result.value.offset).toBe(0);
    }
  });

  it("rejects an unknown category with field detail", () => {
    const result = validatePublicListingQuery({ category: "gigwork" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.category).toContain("farm");
    }
  });

  it("rejects a partial bounding box", () => {
    const result = validatePublicListingQuery({ minLat: "44", maxLat: "46" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields?.bounds).toContain("all of");
  });

  it("rejects inverted and antimeridian-crossing boxes", () => {
    const inverted = validatePublicListingQuery({
      minLat: "46", maxLat: "44", minLng: "-122", maxLng: "-120",
    });
    expect(inverted.ok).toBe(false);
    const crossing = validatePublicListingQuery({
      minLat: "40", maxLat: "45", minLng: "170", maxLng: "-170",
    });
    expect(crossing.ok).toBe(false);
  });

  it("rejects an out-of-range limit and a garbage cursor", () => {
    expect(validatePublicListingQuery({ limit: "500" }).ok).toBe(false);
    expect(validatePublicListingQuery({ cursor: "!!not-base64!!" }).ok).toBe(false);
    expect(validatePublicListingQuery({ housing: "maybe" }).ok).toBe(false);
  });
});

describe("cursor — opaque and round-trippable", () => {
  it("round-trips offsets", () => {
    expect(decodePublicCursor(encodePublicCursor(0))).toBe(0);
    expect(decodePublicCursor(encodePublicCursor(48))).toBe(48);
    expect(decodePublicCursor(undefined)).toBe(0);
  });

  it("rejects tampered cursors", () => {
    expect(decodePublicCursor("AAAA")).toBeNull();
    expect(decodePublicCursor(Buffer.from("o:-5").toString("base64url"))).toBeNull();
    expect(decodePublicCursor(Buffer.from("x:1").toString("base64url"))).toBeNull();
  });
});

describe("DTO privacy — pinned public key sets (PII leakage gate)", () => {
  it("listing summary exposes EXACTLY the public v1 keys", async () => {
    mockDb.searchListings.mockResolvedValue([rawRow]);
    const result = await searchPublicListings({ limit: 24, offset: 0 });
    const listing = result.listings[0]!;
    expect(Object.keys(listing).sort()).toEqual(
      [
        "beginsAt",
        "benefits",
        "category",
        "coverPhotoUrl",
        "endsAt",
        "id",
        "location",
        "organizationId",
        "organizationName",
        "publishedAt",
        "title",
        "url",
        "visaSupport",
      ].sort(),
    );
    expect(Object.keys(listing.location).sort()).toEqual(["label", "point", "precision"]);
    expect(Object.keys(listing.benefits).sort()).toEqual(["housing", "meals", "pay"]);
    // The raw row's status / subscription_tier / internal joins never leak.
    expect(JSON.stringify(listing)).not.toContain("subscription_tier");
    expect(JSON.stringify(listing)).not.toContain('"status"');
  });

  it("listing detail adds only description + gallery", async () => {
    mockDb.getPublicListingById.mockResolvedValue(rawRow);
    const listing = await getPublicListingV1(rawRow.id);
    expect(listing).not.toBeNull();
    expect(Object.keys(listing!).sort()).toEqual(
      [
        "beginsAt",
        "benefits",
        "category",
        "coverPhotoUrl",
        "description",
        "endsAt",
        "galleryPhotoUrls",
        "id",
        "location",
        "organizationId",
        "organizationName",
        "publishedAt",
        "title",
        "url",
        "visaSupport",
      ].sort(),
    );
  });

  it("organization DTO exposes only public host fields", async () => {
    mockDb.getPublicHostProfile.mockResolvedValue({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      companyName: "Sunrise Orchards",
      hostName: "Dana", // PRIVATE-ish person name — must not map out
      tagline: "Grow with us",
      about: "Family orchard.",
      primaryLocationName: "Hood River, OR",
      photoUrl: null,
      websiteUrl: null,
      socialLinks: { instagram: null, twitter: null },
      categoryScopes: ["farm", "not-a-category"],
      housingOfferedGenerally: true,
      mealsOfferedGenerally: false,
      verified: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
    mockDb.getPublicListingsByHost.mockResolvedValue([{ id: "x" }]);
    const org = await getPublicOrganizationV1("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(org).not.toBeNull();
    expect(Object.keys(org!).sort()).toEqual(
      [
        "about",
        "categories",
        "id",
        "liveListingCount",
        "memberSince",
        "name",
        "photoUrl",
        "primaryLocationName",
        "tagline",
        "url",
        "verified",
        "websiteUrl",
      ].sort(),
    );
    expect(org!.categories).toEqual(["farm"]); // invalid category filtered
    expect(JSON.stringify(org)).not.toContain("Dana");
    expect(org!.liveListingCount).toBe(1);
  });
});

describe("search + detail behavior", () => {
  it("paginates with an over-fetch and returns nextCursor", async () => {
    mockDb.searchListings.mockResolvedValue([rawRow, { ...rawRow, id: "22222222-2222-3333-4444-555555555555" }]);
    const result = await searchPublicListings({ limit: 1, offset: 0 });
    expect(result.listings).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
    expect(decodePublicCursor(result.nextCursor!)).toBe(1);
    // The db was asked for limit+1 rows at the given offset.
    expect(mockDb.searchListings).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2, offset: 0 }),
    );
  });

  it("empty inventory returns an empty array, not an error or filler", async () => {
    mockDb.searchListings.mockResolvedValue([]);
    const result = await searchPublicListings({ limit: 24, offset: 0 });
    expect(result.listings).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("malformed listing ids never reach the database", async () => {
    const listing = await getPublicListingV1("../../etc/passwd");
    expect(listing).toBeNull();
    expect(mockDb.getPublicListingById).not.toHaveBeenCalled();
  });

  it("non-live/unknown listings are null (live-only surface)", async () => {
    mockDb.getPublicListingById.mockResolvedValue(null); // live-only query
    const listing = await getPublicListingV1(rawRow.id);
    expect(listing).toBeNull();
  });

  it("remote listings carry the honest 'remote' precision", async () => {
    mockDb.searchListings.mockResolvedValue([
      { ...rawRow, category: "remote", latitude: null, longitude: null, location_display: null },
    ]);
    const result = await searchPublicListings({ limit: 24, offset: 0 });
    expect(result.listings[0]!.location.precision).toBe("remote");
    expect(result.listings[0]!.location.point).toBeNull();
  });

  it("label-only listings never gain fabricated coordinates", async () => {
    mockDb.searchListings.mockResolvedValue([
      { ...rawRow, latitude: null, longitude: null },
    ]);
    const result = await searchPublicListings({ limit: 24, offset: 0 });
    expect(result.listings[0]!.location.precision).toBe("label_only");
    expect(result.listings[0]!.location.point).toBeNull();
    expect(result.listings[0]!.location.label).toBe("Hood River, OR");
  });
});
