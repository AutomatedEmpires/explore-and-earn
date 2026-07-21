import { afterEach, describe, expect, it } from "vitest";

import {
  isLocalStorageUrl,
  isOwnedBenefitPhotoUrl,
} from "../../lib/storageUrl";

const hostId = "host-1";
const listingId = "listing-1";
const root =
  "https://mamosbzcbigcclafhmmr.supabase.co/storage/v1/object/public/listing-media";

describe("benefit photo ownership", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("preserves the legacy exact-slot Meals object", () => {
    expect(
      isOwnedBenefitPhotoUrl(
        `${root}/${hostId}/benefit/${listingId}/meals/kitchen`,
        hostId,
        listingId,
        "meals",
        "kitchen",
      ),
    ).toBe(true);
  });

  it("accepts versioned children for Meals and Housing", () => {
    expect(
      isOwnedBenefitPhotoUrl(
        `${root}/${hostId}/benefit/${listingId}/meals/kitchen/version.webp`,
        hostId,
        listingId,
        "meals",
        "kitchen",
      ),
    ).toBe(true);
    expect(
      isOwnedBenefitPhotoUrl(
        `${root}/${hostId}/benefit/${listingId}/housing/sleeping_area/version.webp`,
        hostId,
        listingId,
        "housing",
        "sleeping_area",
      ),
    ).toBe(true);
  });

  it("rejects an unversioned Housing object and adjacent or foreign paths", () => {
    expect(
      isOwnedBenefitPhotoUrl(
        `${root}/${hostId}/benefit/${listingId}/housing/sleeping_area`,
        hostId,
        listingId,
        "housing",
        "sleeping_area",
      ),
    ).toBe(false);
    expect(
      isOwnedBenefitPhotoUrl(
        `${root}/${hostId}/benefit/${listingId}/housing/sleeping_area-other/file.webp`,
        hostId,
        listingId,
        "housing",
        "sleeping_area",
      ),
    ).toBe(false);
    expect(
      isOwnedBenefitPhotoUrl(
        `https://example.test/storage/v1/object/public/listing-media/${hostId}/benefit/${listingId}/housing/sleeping_area/file.webp`,
        hostId,
        listingId,
        "housing",
        "sleeping_area",
      ),
    ).toBe(false);
  });

  it("only bypasses image optimization for loopback Storage URLs", () => {
    expect(
      isLocalStorageUrl(
        "http://127.0.0.1:54321/storage/v1/object/public/listing-media/photo.webp",
      ),
    ).toBe(true);
    expect(
      isLocalStorageUrl(
        "http://localhost:54321/storage/v1/object/public/listing-media/photo.webp",
      ),
    ).toBe(true);
    expect(isLocalStorageUrl(`${root}/photo.webp`)).toBe(false);
    expect(isLocalStorageUrl("http://localhost:3000/not-storage/photo.webp")).toBe(false);
  });
});
