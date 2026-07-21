import {
  housingPhotoLabel,
  missingHousingPhotoRoles,
  type HostBenefitLibrary,
  type HousingPhotoMap,
} from "@explore-and-earn/contracts";

export type ClaimBenefitChoice = "not_stated" | "yes" | "no";

/** Every claimed live listing must cross the existing triad publication gate. */
export function claimBenefitTruthError(
  housing: ClaimBenefitChoice,
  meals: ClaimBenefitChoice,
  payMinCents: number | null,
  payMaxCents: number | null,
): string | null {
  if (housing === "not_stated") {
    return "Confirm whether housing is included or not included.";
  }
  if (meals === "not_stated") {
    return "Confirm whether meals are included or not included.";
  }
  if (Math.max(payMinCents ?? 0, payMaxCents ?? 0) <= 0) {
    return "Enter a minimum or maximum pay amount greater than zero.";
  }
  return null;
}

/** Client-side copy for the same four-role gate enforced by Postgres. */
export function claimHousingPhotoError(
  choice: ClaimBenefitChoice,
  photos: HousingPhotoMap,
  category: string,
): string | null {
  if (choice !== "yes") return null;
  const missing = missingHousingPhotoRoles(photos);
  if (missing.length === 0) return null;
  return `Housing Included requires ${missing
    .map((role) => housingPhotoLabel(role, category))
    .join(", ")}.`;
}

/** Preserve future library keys while replacing only the four housing slots. */
export function withClaimHousingPhotos(
  library: HostBenefitLibrary,
  photos: HousingPhotoMap,
): HostBenefitLibrary {
  return {
    ...library,
    housing: {
      ...library.housing,
      photos,
    },
  };
}
