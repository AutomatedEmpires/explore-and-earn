import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPublicBenefitDetails,
  getPublicHousingPhotos,
} from "../src/queries/benefitDetails";

function publicClient(
  benefitDetails: unknown,
  housingRows: unknown[],
  safeBenefitDetails: unknown = benefitDetails,
): SupabaseClient {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { benefit_details: benefitDetails },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === "get_public_benefit_details"
            ? safeBenefitDetails
            : housingRows,
        error: null,
      }),
    ),
  } as unknown as SupabaseClient;
}

describe("public housing-photo boundary", () => {
  it("fails closed when RPC rows are incomplete or malformed", async () => {
    const db = publicClient({}, [
      { role: "sleeping_area", url: "sleep", source: "profile" },
      { role: "kitchen", url: "kitchen", source: "listing" },
      { role: "unknown", url: "bad", source: "listing" },
      { role: "bathroom", url: "", source: "profile" },
      { role: "dining_common", url: "dining", source: "untrusted" },
    ]);

    await expect(getPublicHousingPhotos("listing-id", db)).resolves.toEqual([]);
  });

  it("keeps one valid row for each role in RPC order", async () => {
    const rows = [
      { role: "sleeping_area", url: "sleep", source: "profile" },
      { role: "bathroom", url: "bath", source: "profile" },
      { role: "kitchen", url: "kitchen", source: "listing" },
      { role: "dining_common", url: "dining", source: "profile" },
    ];
    const db = publicClient({}, rows);
    await expect(getPublicHousingPhotos("listing-id", db)).resolves.toEqual(rows);
  });

  it("removes persisted housing photos when the RPC declares them ineligible", async () => {
    const safe = {
      housing: {
        fields: { arrangement: "Shared bunkhouse" },
        toggles: { amenities: ["wifi"] },
        photos: {},
      },
      meals: { fields: { plan: "Lunch" }, toggles: {}, photos: {} },
    };
    const db = publicClient(
      {
        housing: {
          fields: { arrangement: "Shared bunkhouse" },
          toggles: { amenities: ["wifi"] },
          photos: { sleeping_area: "stale-private-url" },
        },
        meals: { fields: { plan: "Lunch" }, toggles: {}, photos: {} },
      },
      [],
      safe,
    );

    await expect(getPublicBenefitDetails("listing-id", db)).resolves.toEqual(safe);
  });

  it("replaces stale JSON with the effective profile and listing sources", async () => {
    const effective = {
      housing: {
        fields: {},
        toggles: {},
        photos: {
          sleeping_area: "profile-sleep",
          bathroom: "profile-bath",
          kitchen: "listing-kitchen",
          dining_common: "profile-dining",
        },
      },
    };
    const db = publicClient(
      { housing: { fields: {}, toggles: {}, photos: { kitchen: "stale" } } },
      [
        { role: "sleeping_area", url: "profile-sleep", source: "profile" },
        { role: "bathroom", url: "profile-bath", source: "profile" },
        { role: "kitchen", url: "listing-kitchen", source: "listing" },
        { role: "dining_common", url: "profile-dining", source: "profile" },
      ],
      effective,
    );

    await expect(getPublicBenefitDetails("listing-id", db)).resolves.toEqual(effective);
  });

  it("fails closed on unconfirmed raw details during the app-before-072 fallback", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          benefit_details: {
            housing: {
              fields: { arrangement: "Unreviewed source room" },
              toggles: {},
              photos: { sleeping_area: "private-source-photo" },
            },
            meals: {
              fields: { plan: "Confirmed lunch" },
              toggles: {},
              photos: {},
            },
          },
          housing_included: true,
          meals_included: true,
          housing_evidence: "not_stated",
          meals_evidence: "confirmed",
        },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const db = {
      from: vi.fn().mockReturnValue(query),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function get_public_benefit_details",
        },
      }),
    } as unknown as SupabaseClient;

    await expect(getPublicBenefitDetails("listing-id", db)).resolves.toEqual({
      meals: {
        fields: { plan: "Confirmed lunch" },
        toggles: {},
        photos: {},
      },
    });
    expect(query.eq).toHaveBeenCalledWith("provenance", "verified");
  });
});
