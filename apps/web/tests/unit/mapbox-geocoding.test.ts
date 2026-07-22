import { describe, expect, it, vi } from "vitest";

import {
  MapboxGeocodingError,
  buildMapboxGeocodingUrl,
  normalizeMapboxQuery,
  parseMapboxGeocodingResponse,
  searchMapboxLocations,
} from "../../lib/mapboxGeocoding";

const VALID_RESPONSE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "place.test-one",
      geometry: { type: "Point", coordinates: [-120.3103, 47.4235] },
      properties: {
        mapbox_id: "dXJuOm1ieHBsYzp0ZXN0",
        feature_type: "place",
        name: "Wenatchee",
        place_formatted: "Washington, United States",
      },
    },
  ],
};

describe("Mapbox listing geocoding", () => {
  it("builds a permanent, area-only v6 request", () => {
    const url = buildMapboxGeocodingUrl("  Wenatchee,   WA ", "pk.test");
    expect(url.origin + url.pathname).toBe(
      "https://api.mapbox.com/search/geocode/v6/forward",
    );
    expect(url.searchParams.get("q")).toBe("Wenatchee, WA");
    expect(url.searchParams.get("permanent")).toBe("true");
    expect(url.searchParams.get("autocomplete")).toBe("false");
    expect(url.searchParams.get("types")).toBe(
      "place,locality,district,region,country",
    );
    expect(url.searchParams.get("access_token")).toBe("pk.test");
  });

  it("rejects provider-invalid or unsaveable searches before fetch", () => {
    expect(() => normalizeMapboxQuery(" ")).toThrow(MapboxGeocodingError);
    expect(() => normalizeMapboxQuery("Portland; Oregon")).toThrow(
      /20 words or fewer/,
    );
    expect(() =>
      normalizeMapboxQuery(Array.from({ length: 21 }, () => "place").join(" ")),
    ).toThrow(/20 words or fewer/);
    expect(() => buildMapboxGeocodingUrl("Portland, OR", " ")).toThrow(
      /temporarily unavailable/,
    );
  });

  it("parses complete bounded points and discards malformed provider rows", () => {
    const suggestions = parseMapboxGeocodingResponse({
      ...VALID_RESPONSE,
      features: [
        ...VALID_RESPONSE.features,
        {
          type: "Feature",
          id: "bad-bounds",
          geometry: { type: "Point", coordinates: [-120, 95] },
          properties: {
            feature_type: "place",
            name: "Impossible place",
          },
        },
        {
          type: "Feature",
          id: "private-address",
          geometry: { type: "Point", coordinates: [-120, 47] },
          properties: {
            feature_type: "address",
            full_address: "123 Private Street",
          },
        },
      ],
    });

    expect(suggestions).toEqual([
      {
        id: "dXJuOm1ieHBsYzp0ZXN0",
        label: "Wenatchee, Washington, United States",
        point: { lat: 47.4235, lng: -120.3103 },
      },
    ]);
  });

  it("fetches once and never accepts a non-success provider response", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(VALID_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      searchMapboxLocations(
        "Wenatchee, WA",
        "pk.test",
        undefined,
        fetcher as typeof fetch,
      ),
    ).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const unavailable = vi.fn(async () => new Response(null, { status: 429 }));
    await expect(
      searchMapboxLocations(
        "Wenatchee, WA",
        "pk.test",
        undefined,
        unavailable as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
