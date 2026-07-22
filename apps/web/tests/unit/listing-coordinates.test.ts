import { describe, expect, it } from "vitest";

import { parseListingCoordinateSubmission } from "../../lib/listingCoordinates";

describe("parseListingCoordinateSubmission", () => {
  it("preserves coordinates when no location fields were submitted", () => {
    expect(parseListingCoordinateSubmission(new FormData())).toEqual({
      ok: true,
      coordinates: undefined,
    });
  });

  it("clears a stale point for a legacy location-name-only submission", () => {
    const formData = new FormData();
    formData.set("locationName", "Yakima, WA");
    expect(parseListingCoordinateSubmission(formData)).toEqual({
      ok: true,
      coordinates: null,
    });
  });

  it("treats a complete blank pair as an explicit clear", () => {
    const formData = new FormData();
    formData.set("locationName", "Yakima, WA");
    formData.set("latitude", "");
    formData.set("longitude", "");
    expect(parseListingCoordinateSubmission(formData)).toEqual({
      ok: true,
      coordinates: null,
    });
  });

  it("accepts a complete bounded point, including zero", () => {
    const formData = new FormData();
    formData.set("locationName", "Gulf of Guinea");
    formData.set("latitude", "0");
    formData.set("longitude", "0");
    expect(parseListingCoordinateSubmission(formData)).toEqual({
      ok: true,
      coordinates: { lat: 0, lng: 0 },
    });
  });

  it.each([
    { entries: [["latitude", "47.4"]] },
    {
      entries: [
        ["latitude", ""],
        ["longitude", "-120.3"],
      ],
    },
    {
      entries: [
        ["latitude", "not-a-number"],
        ["longitude", "-120.3"],
      ],
    },
    {
      entries: [
        ["latitude", "90.1"],
        ["longitude", "-120.3"],
      ],
    },
  ] as ReadonlyArray<{ entries: ReadonlyArray<readonly [string, string]> }>)(
    "rejects partial, malformed, or out-of-bounds pairs",
    ({ entries }) => {
    const formData = new FormData();
    formData.set("locationName", "Yakima, WA");
    for (const [key, value] of entries) formData.set(key, value);
    expect(parseListingCoordinateSubmission(formData)).toMatchObject({ ok: false });
    },
  );

  it("rejects a point without a display location", () => {
    const formData = new FormData();
    formData.set("locationName", " ");
    formData.set("latitude", "47.4");
    formData.set("longitude", "-120.3");
    expect(parseListingCoordinateSubmission(formData)).toMatchObject({ ok: false });
  });
});
