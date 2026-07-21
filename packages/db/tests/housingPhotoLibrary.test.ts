import { describe, expect, it } from "vitest";

import {
  HOUSING_PHOTO_ROLES,
  effectiveHousingPhotoMap,
  housingPhotoLabel,
  missingHousingPhotoRoles,
  resolveEffectiveHousingPhotos,
  sanitizeHostBenefitLibrary,
  sanitizeHousingPhotoMap,
  validateListingForPublication,
  type HousingPhotoMap,
} from "@explore-and-earn/contracts";

const urls: HousingPhotoMap = {
  sleeping_area: "https://example.test/sleep",
  bathroom: "https://example.test/bath",
  kitchen: "https://example.test/kitchen",
  dining_common: "https://example.test/dining",
};

const publishable = {
  provenance: "verified",
  housingEvidence: "confirmed",
  housingIncluded: true,
  housingPhotos: urls,
  mealsEvidence: "confirmed",
  payEvidence: "confirmed",
  payMinCents: 2_000,
} as const;

describe("housing photo contract", () => {
  it("keeps only the four semantic roles and trims their URLs", () => {
    expect(
      sanitizeHousingPhotoMap({
        sleeping_area: "  https://example.test/sleep  ",
        bathroom: "",
        kitchen: 42,
        dining_common: "https://example.test/dining",
        exterior: "https://example.test/not-evidence",
      }),
    ).toEqual({
      sleeping_area: "https://example.test/sleep",
      dining_common: "https://example.test/dining",
    });
  });

  it("parses the reusable library fail-closed", () => {
    expect(
      sanitizeHostBenefitLibrary({ housing: { photos: urls }, future: { ignored: true } }),
    ).toEqual({ housing: { photos: urls } });
    expect(sanitizeHostBenefitLibrary({ housing: { photos: "not-an-object" } })).toEqual({});
  });

  it("inherits defaults in stable role order", () => {
    expect(resolveEffectiveHousingPhotos({ housing: { photos: urls } }, {})).toEqual(
      HOUSING_PHOTO_ROLES.map((role) => ({ role, url: urls[role], source: "profile" })),
    );
  });

  it("uses a listing override for only that role", () => {
    const override = "https://example.test/listing-kitchen";
    expect(
      resolveEffectiveHousingPhotos(
        { housing: { photos: urls } },
        { kitchen: override },
      ),
    ).toEqual([
      { role: "sleeping_area", url: urls.sleeping_area, source: "profile" },
      { role: "bathroom", url: urls.bathroom, source: "profile" },
      { role: "kitchen", url: override, source: "listing" },
      { role: "dining_common", url: urls.dining_common, source: "profile" },
    ]);
  });

  it("falls back to the profile when an override is removed", () => {
    const library = { housing: { photos: urls } };
    expect(effectiveHousingPhotoMap(library, { kitchen: "override" }).kitchen).toBe("override");
    expect(effectiveHousingPhotoMap(library, {}).kitchen).toBe(urls.kitchen);
  });

  it("reports every missing role", () => {
    expect(missingHousingPhotoRoles({ sleeping_area: "one" })).toEqual([
      "bathroom",
      "kitchen",
      "dining_common",
    ]);
  });

  it("adapts labels for maritime without changing semantic roles", () => {
    expect(HOUSING_PHOTO_ROLES).toEqual([
      "sleeping_area",
      "bathroom",
      "kitchen",
      "dining_common",
    ]);
    expect(HOUSING_PHOTO_ROLES.map((role) => housingPhotoLabel(role, "maritime"))).toEqual([
      "Cabin/berth",
      "Head",
      "Galley",
      "Mess",
    ]);
    expect(HOUSING_PHOTO_ROLES.map((role) => housingPhotoLabel(role, "farm"))).toEqual([
      "Sleeping area",
      "Bathroom",
      "Kitchen",
      "Dining/common area",
    ]);
  });
});

describe("housing photo publication contract", () => {
  it("publishes with four inherited or mixed effective photos", () => {
    expect(validateListingForPublication(publishable)).toEqual({ ok: true });
    expect(
      validateListingForPublication({
        ...publishable,
        housingPhotos: effectiveHousingPhotoMap(
          { housing: { photos: urls } },
          { kitchen: "https://example.test/listing-kitchen" },
        ),
      }),
    ).toEqual({ ok: true });
  });

  it.each(HOUSING_PHOTO_ROLES)("rejects publication when %s is missing", (role) => {
    const incomplete = { ...urls };
    delete incomplete[role];
    const verdict = validateListingForPublication({ ...publishable, housingPhotos: incomplete });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.blockers).toEqual([
        expect.objectContaining({ field: "housing", missingPhotoRoles: [role] }),
      ]);
    }
  });

  it("does not require photos when housing is explicitly not included", () => {
    expect(
      validateListingForPublication({
        ...publishable,
        housingIncluded: false,
        housingPhotos: {},
      }),
    ).toEqual({ ok: true });
  });

  it("preserves the sourced-listing exemption", () => {
    expect(
      validateListingForPublication({
        provenance: "sourced",
        housingEvidence: "not_stated",
        housingIncluded: true,
        housingPhotos: {},
      }),
    ).toEqual({ ok: true });
  });
});
