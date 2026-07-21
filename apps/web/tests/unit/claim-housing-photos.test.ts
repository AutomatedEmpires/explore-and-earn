import { describe, expect, it } from "vitest";

import {
  claimBenefitTruthError,
  claimHousingPhotoError,
  withClaimHousingPhotos,
} from "../../components/claim/claimHousingPhotos";

const complete = {
  sleeping_area: "sleep",
  bathroom: "bath",
  kitchen: "kitchen",
  dining_common: "dining",
} as const;

describe("claim confirmation housing gate", () => {
  it("requires explicit Housing, Meals, and a positive pay figure", () => {
    expect(claimBenefitTruthError("not_stated", "yes", 2000, null)).toMatch(
      /whether housing/i,
    );
    expect(claimBenefitTruthError("yes", "not_stated", 2000, null)).toMatch(
      /whether meals/i,
    );
    expect(claimBenefitTruthError("yes", "no", 0, null)).toMatch(/greater than zero/i);
    expect(claimBenefitTruthError("yes", "no", 2000, null)).toBeNull();
  });

  it("blocks Housing Included until every adaptive role is present", () => {
    expect(
      claimHousingPhotoError(
        "yes",
        { sleeping_area: "sleep" },
        "maritime",
      ),
    ).toBe("Housing Included requires Head, Galley, Mess.");
    expect(claimHousingPhotoError("yes", complete, "farm")).toBeNull();
  });

  it("does not require photos for a negative or unstated housing answer", () => {
    expect(claimHousingPhotoError("no", {}, "farm")).toBeNull();
    expect(claimHousingPhotoError("not_stated", {}, "farm")).toBeNull();
  });

  it("updates housing photos without discarding future library keys", () => {
    const library = {
      housing: { photos: { sleeping_area: "old" } },
      future: { retained: true },
    };
    expect(withClaimHousingPhotos(library, complete)).toEqual({
      housing: { photos: complete },
      future: { retained: true },
    });
  });
});
