import type {
  HostBenefitLibrary,
  HousingPhotoMap,
} from "@explore-and-earn/contracts";

export function canManageHostBenefitLibrary(
  hostProfileId: string | undefined,
  benefitLibraryAvailable: boolean,
): boolean {
  return Boolean(hostProfileId) && benefitLibraryAvailable;
}

export function buildHostBenefitLibraryPatch(
  benefitLibraryAvailable: boolean,
  housingPhotos: Readonly<HousingPhotoMap>,
): { readonly benefitLibrary?: HostBenefitLibrary } {
  if (!benefitLibraryAvailable) return {};
  return {
    benefitLibrary: {
      housing: { photos: { ...housingPhotos } },
    },
  };
}
