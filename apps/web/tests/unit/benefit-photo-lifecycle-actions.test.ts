import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const prepareUploadImageMock = vi.hoisted(() => vi.fn());
const uploadGuardMocks = vi.hoisted(() => ({
  guardTrustedUploadSlot: vi.fn(),
  hasTrustedUploadBudget: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  deleteTrustedListingMedia: vi.fn(),
  getBenefitDetailsContext: vi.fn(),
  getPublicBenefitDetails: vi.fn(),
  replaceTrustedListingMedia: vi.fn(),
  resolveOwnedListingHost: vi.fn(),
  saveBenefitDetails: vi.fn(),
  uploadTrustedListingMedia: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/serverCache", () => ({ LISTINGS_CACHE_TAG: "public-listings" }));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/media", () => ({
  prepareUploadImage: prepareUploadImageMock,
}));
vi.mock("../../services/media/trustedUploadGuard", () => uploadGuardMocks);

import {
  discardBenefitPhotoAction,
  saveBenefitDetailsAction,
  uploadBenefitPhotoAction,
} from "../../app/actions/benefitDetails";

const ROOT =
  "https://project-ref.supabase.co/storage/v1/object/public/listing-media";
const benefitUrl = (slot: string, filename: string, host = "host-1") =>
  `${ROOT}/${host}/benefit/listing-1/meals/${slot}/${filename}`;
const housingUrl = (slot: string, filename: string, host = "host-1") =>
  `${ROOT}/${host}/benefit/listing-1/housing/${slot}/${filename}`;

const OLD_KITCHEN = benefitUrl("kitchen", "old.webp");
const NEW_KITCHEN = benefitUrl("kitchen", "new.webp");
const SESSION_FILENAME = "123e4567-e89b-42d3-a456-426614174000.webp";
const SESSION_KITCHEN = benefitUrl("kitchen", SESSION_FILENAME);
const SESSION_HOUSING = housingUrl("sleeping_area", SESSION_FILENAME);
const STABLE_MEALS_KITCHEN = `${ROOT}/host-1/benefit/listing-1/meals/kitchen`;
const OLD_HOUSING_KITCHEN = housingUrl("kitchen", "old.webp");
const NEW_HOUSING_KITCHEN = housingUrl("kitchen", "new.webp");
const UNCHANGED_BATHROOM = housingUrl("bathroom", "same.webp");
const REMOVED_DINING_COMMON = housingUrl("dining_common", "removed.webp");

function authAs(userId: string | null, token: string | null = "session-token") {
  authMock.mockResolvedValueOnce({
    userId,
    getToken: vi.fn().mockResolvedValue(token),
  });
}

function contextWithPhotos(
  photos: Record<string, string>,
  kind: "housing" | "meals" = "meals",
) {
  return {
    details: {
      [kind]: { fields: {}, toggles: {}, photos },
    },
    benefitLibrary: {},
    housingPhotoLibraryAvailable: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-1",
    getToken: vi.fn().mockResolvedValue("session-token"),
  });
  dbMocks.resolveOwnedListingHost.mockResolvedValue({ hostProfileId: "host-1" });
  dbMocks.getBenefitDetailsContext.mockResolvedValue(contextWithPhotos({}));
  dbMocks.saveBenefitDetails.mockResolvedValue({ ok: true });
  dbMocks.deleteTrustedListingMedia.mockResolvedValue(undefined);
  dbMocks.replaceTrustedListingMedia.mockResolvedValue(STABLE_MEALS_KITCHEN);
  uploadGuardMocks.hasTrustedUploadBudget.mockResolvedValue(true);
  uploadGuardMocks.guardTrustedUploadSlot.mockResolvedValue({ ok: true });
});

describe("uploadBenefitPhotoAction abuse bounds", () => {
  it("rate-limits direct calls before ownership, Sharp, or Storage work", async () => {
    uploadGuardMocks.hasTrustedUploadBudget.mockResolvedValueOnce(false);
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1])], "meal.jpg", {
      type: "image/jpeg",
    }));

    const result = await uploadBenefitPhotoAction(
      "listing-1",
      "housing",
      "sleeping_area",
      formData,
    );

    expect(result.ok).toBe(false);
    expect(uploadGuardMocks.hasTrustedUploadBudget).toHaveBeenCalledWith("user-1");
    expect(dbMocks.resolveOwnedListingHost).not.toHaveBeenCalled();
    expect(prepareUploadImageMock).not.toHaveBeenCalled();
    expect(dbMocks.uploadTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("enforces durable slot capacity before decoding", async () => {
    uploadGuardMocks.guardTrustedUploadSlot.mockResolvedValueOnce({
      ok: false,
      error: "slot_full",
    });
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1])], "meal.jpg", {
      type: "image/jpeg",
    }));

    const result = await uploadBenefitPhotoAction(
      "listing-1",
      "housing",
      "sleeping_area",
      formData,
    );

    expect(result).toEqual({ ok: false, error: "slot_full" });
    expect(uploadGuardMocks.guardTrustedUploadSlot).toHaveBeenCalledWith({
      prefix: "host-1/benefit/listing-1/housing/sleeping_area",
      referencedPaths: new Set(),
    });
    expect(prepareUploadImageMock).not.toHaveBeenCalled();
    expect(dbMocks.uploadTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("rejects arbitrary Meals prefixes before authentication", async () => {
    const result = await uploadBenefitPhotoAction(
      "listing-1",
      "meals",
      "attacker-created-slot",
      new FormData(),
    );

    expect(result).toEqual({ ok: false, error: "Unknown meals photo slot." });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("normalizes and overwrites one deterministic Meals object without destructive cleanup", async () => {
    const bytes = new Uint8Array([82, 73, 70, 70]);
    prepareUploadImageMock.mockResolvedValueOnce({
      ok: true,
      image: { bytes, contentType: "image/webp" },
    });
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1])], "meal.jpg", {
      type: "image/jpeg",
    }));

    await expect(
      uploadBenefitPhotoAction("listing-1", "meals", "kitchen", formData),
    ).resolves.toEqual({ ok: true, url: STABLE_MEALS_KITCHEN });
    expect(dbMocks.replaceTrustedListingMedia).toHaveBeenCalledWith({
      path: "host-1/benefit/listing-1/meals/kitchen",
      bytes,
      contentType: "image/webp",
    });
    expect(uploadGuardMocks.guardTrustedUploadSlot).not.toHaveBeenCalled();
    expect(dbMocks.uploadTrustedListingMedia).not.toHaveBeenCalled();
  });
});

describe("saveBenefitDetailsAction photo cleanup", () => {
  it("deletes replaced and removed exact owned objects only after a successful save", async () => {
    dbMocks.saveBenefitDetails.mockResolvedValueOnce({
      ok: true,
      previous: {
        fields: {},
        toggles: {},
        photos: {
          kitchen: OLD_HOUSING_KITCHEN,
          bathroom: UNCHANGED_BATHROOM,
          dining_common: REMOVED_DINING_COMMON,
          adjacent: housingUrl("adjacent", "nested/escape.webp"),
          foreign: housingUrl("foreign", "other.webp", "host-2"),
          queried: `${housingUrl("queried", "old.webp")}?download=1`,
        },
      },
    });

    const result = await saveBenefitDetailsAction("listing-1", "housing", {
      fields: {},
      toggles: {},
      photos: {
        kitchen: NEW_HOUSING_KITCHEN,
        bathroom: UNCHANGED_BATHROOM,
      },
    });

    expect(result).toEqual({ ok: true });
    expect(dbMocks.saveBenefitDetails).toHaveBeenCalledWith(
      "session-token",
      "user-1",
      "listing-1",
      "housing",
      {
        fields: {},
        toggles: {},
        photos: {
          kitchen: NEW_HOUSING_KITCHEN,
          bathroom: UNCHANGED_BATHROOM,
        },
      },
    );
    expect(dbMocks.deleteTrustedListingMedia.mock.calls).toEqual([
      ["host-1/benefit/listing-1/housing/kitchen/old.webp"],
      ["host-1/benefit/listing-1/housing/dining_common/removed.webp"],
    ]);
    expect(
      dbMocks.saveBenefitDetails.mock.invocationCallOrder[0],
    ).toBeLessThan(dbMocks.deleteTrustedListingMedia.mock.invocationCallOrder[0]);
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/host/listings"],
      ["/host/listings/listing-1"],
      ["/listing/listing-1"],
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith("public-listings");
  });

  it("never deletes prior objects when the database save fails", async () => {
    dbMocks.saveBenefitDetails.mockResolvedValueOnce({
      ok: false,
      error: "write_failed",
    });

    const result = await saveBenefitDetailsAction("listing-1", "housing", {
      fields: {},
      toggles: {},
      photos: { kitchen: NEW_HOUSING_KITCHEN },
    });

    expect(result).toEqual({ ok: false, error: "write_failed" });
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports cleanup failures without changing the successful save result", async () => {
    const cleanupError = new Error("storage unavailable");
    dbMocks.saveBenefitDetails.mockResolvedValueOnce({
      ok: true,
      previous: {
        fields: {},
        toggles: {},
        photos: { kitchen: OLD_HOUSING_KITCHEN },
      },
    });
    dbMocks.deleteTrustedListingMedia.mockRejectedValueOnce(cleanupError);

    const result = await saveBenefitDetailsAction("listing-1", "housing", {
      fields: {},
      toggles: {},
      photos: {},
    });

    expect(result).toEqual({ ok: true });
    expect(reportErrorMock).toHaveBeenCalledWith(cleanupError, {
      action: "cleanupReplacedBenefitPhoto",
      userId: "user-1",
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("public-listings");
  });

  it("uses the write result instead of a race-prone cleanup snapshot read", async () => {
    dbMocks.saveBenefitDetails.mockResolvedValueOnce({
      ok: true,
      previous: {
        fields: {},
        toggles: {},
        photos: { kitchen: OLD_KITCHEN },
      },
    });
    const result = await saveBenefitDetailsAction("listing-1", "meals", {
      fields: {},
      toggles: {},
      photos: { kitchen: NEW_KITCHEN },
    });

    expect(result).toEqual({ ok: true });
    expect(dbMocks.saveBenefitDetails).toHaveBeenCalled();
    expect(dbMocks.getBenefitDetailsContext).not.toHaveBeenCalled();
    // Meals uses stable in-place objects and never races a destructive delete
    // against another save.
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });
});

describe("discardBenefitPhotoAction", () => {
  it("requires authentication before ownership or deletion checks", async () => {
    authAs(null);

    const result = await discardBenefitPhotoAction(
      "listing-1",
      "meals",
      "kitchen",
      SESSION_KITCHEN,
    );

    expect(result.ok).toBe(false);
    expect(dbMocks.resolveOwnedListingHost).not.toHaveBeenCalled();
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("retains a deterministic Meals object when an unsaved edit is discarded", async () => {
    const result = await discardBenefitPhotoAction(
      "listing-1",
      "meals",
      "kitchen",
      STABLE_MEALS_KITCHEN,
    );

    expect(result).toEqual({ ok: true });
    expect(dbMocks.resolveOwnedListingHost).toHaveBeenCalledWith(
      "session-token",
      "user-1",
      "listing-1",
    );
    expect(dbMocks.getBenefitDetailsContext).not.toHaveBeenCalled();
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced Housing object from the caller's exact role", async () => {
    const result = await discardBenefitPhotoAction(
      "listing-1",
      "housing",
      "sleeping_area",
      SESSION_HOUSING,
    );

    expect(result).toEqual({ ok: true });
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledWith(
      `host-1/benefit/listing-1/housing/sleeping_area/${SESSION_FILENAME}`,
    );
  });

  it.each([
    ["foreign host", housingUrl("sleeping_area", SESSION_FILENAME, "host-2")],
    ["adjacent slot", housingUrl("sleeping_area-other", SESSION_FILENAME)],
    ["nested path", housingUrl("sleeping_area", `nested/${SESSION_FILENAME}`)],
    ["query suffix", `${SESSION_HOUSING}?download=1`],
    ["non-session filename", housingUrl("sleeping_area", "old.webp")],
  ])("rejects a %s URL without deleting it", async (_label, url) => {
    const result = await discardBenefitPhotoAction(
      "listing-1",
      "housing",
      "sleeping_area",
      url,
    );

    expect(result).toEqual({
      ok: false,
      error: "Photo does not belong to this benefit slot.",
    });
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("refuses to discard an object that the listing still references", async () => {
    dbMocks.getBenefitDetailsContext.mockResolvedValueOnce(
      contextWithPhotos({ sleeping_area: SESSION_HOUSING }, "housing"),
    );

    const result = await discardBenefitPhotoAction(
      "listing-1",
      "housing",
      "sleeping_area",
      SESSION_HOUSING,
    );

    expect(result).toEqual({
      ok: false,
      error: "Save your changes before discarding this photo.",
    });
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("reports storage failures and returns a safe error", async () => {
    const deleteError = new Error("internal bucket detail");
    dbMocks.deleteTrustedListingMedia.mockRejectedValueOnce(deleteError);

    const result = await discardBenefitPhotoAction(
      "listing-1",
      "housing",
      "sleeping_area",
      SESSION_HOUSING,
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not discard the photo. Please try again.",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(deleteError, {
      action: "discardBenefitPhotoAction",
      userId: "user-1",
    });
  });
});
