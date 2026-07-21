import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
const prepareUploadImageMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const uploadGuardMocks = vi.hoisted(() => ({
  guardTrustedUploadSlot: vi.fn(),
  hasTrustedUploadBudget: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  createHostProfile: vi.fn(),
  deleteTrustedListingMedia: vi.fn(),
  getHostProfile: vi.fn(),
  setMyHousingLibraryPhoto: vi.fn(),
  updateHostProfileDetails: vi.fn(),
  uploadTrustedListingMedia: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/serverCache", () => ({
  HOST_PROFILES_CACHE_TAG: "host-profiles",
  LISTINGS_CACHE_TAG: "public-listings",
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/media", () => ({
  prepareUploadImage: prepareUploadImageMock,
}));
vi.mock("../../services/media/trustedUploadGuard", () => uploadGuardMocks);

import {
  updateHostProfileAction,
  uploadHousingLibraryPhotoAction,
} from "../../app/actions/hostProfile";

const STORAGE_ROOT =
  "https://project-ref.supabase.co/storage/v1/object/public/listing-media";
const OLD_SLEEPING_URL =
  `${STORAGE_ROOT}/host-1/library/housing/sleeping_area/old-sleeping.webp`;
const OLD_BATHROOM_URL =
  `${STORAGE_ROOT}/host-1/library/housing/bathroom/old-bathroom.webp`;
const NEW_SLEEPING_URL =
  `${STORAGE_ROOT}/host-1/library/housing/sleeping_area/new-sleeping.webp`;
const PREPARED_BYTES = new Uint8Array([82, 73, 70, 70]);

function authAs(userId: string | null, token: string | null = "session-token") {
  const getToken = vi.fn().mockResolvedValue(token);
  authMock.mockResolvedValueOnce({ userId, getToken });
  return getToken;
}

function uploadFormData(): FormData {
  const formData = new FormData();
  formData.set(
    "file",
    new File([new Uint8Array([1, 2, 3])], "room.jpg", {
      type: "image/jpeg",
    }),
  );
  return formData;
}

function availableProfile() {
  return {
    id: "host-1",
    benefitLibraryAvailable: true,
    benefitLibrary: {
      housing: {
        photos: {
          sleeping_area: OLD_SLEEPING_URL,
          bathroom: OLD_BATHROOM_URL,
        },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-default",
    getToken: vi.fn().mockResolvedValue("token-default"),
  });
  dbMocks.deleteTrustedListingMedia.mockResolvedValue(undefined);
  dbMocks.getHostProfile.mockResolvedValue(availableProfile());
  dbMocks.setMyHousingLibraryPhoto.mockResolvedValue({
    ok: true,
    hostProfileId: "host-1",
    previousUrl: OLD_SLEEPING_URL,
    benefitLibrary: {
      housing: {
        photos: {
          sleeping_area: NEW_SLEEPING_URL,
          bathroom: OLD_BATHROOM_URL,
        },
      },
    },
  });
  dbMocks.updateHostProfileDetails.mockResolvedValue({ ok: true });
  dbMocks.uploadTrustedListingMedia.mockResolvedValue(NEW_SLEEPING_URL);
  prepareUploadImageMock.mockResolvedValue({
    ok: true,
    image: { bytes: PREPARED_BYTES, contentType: "image/webp" },
  });
  uploadGuardMocks.hasTrustedUploadBudget.mockResolvedValue(true);
  uploadGuardMocks.guardTrustedUploadSlot.mockResolvedValue({ ok: true });
});

describe("uploadHousingLibraryPhotoAction authorization", () => {
  it("rejects an unknown role before auth, image processing, or storage", async () => {
    const result = await uploadHousingLibraryPhotoAction(
      "private_bedroom",
      uploadFormData(),
    );

    expect(result).toEqual({
      ok: false,
      error: "invalid_housing_photo_role",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(prepareUploadImageMock).not.toHaveBeenCalled();
    expect(dbMocks.uploadTrustedListingMedia).not.toHaveBeenCalled();
  });

  it("short-circuits an unauthenticated caller before profile or media work", async () => {
    const getToken = authAs(null);

    const result = await uploadHousingLibraryPhotoAction(
      "sleeping_area",
      uploadFormData(),
    );

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(getToken).not.toHaveBeenCalled();
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(prepareUploadImageMock).not.toHaveBeenCalled();
  });

  it("requires a session token before resolving the host profile", async () => {
    authAs("user-1", null);

    const result = await uploadHousingLibraryPhotoAction(
      "sleeping_area",
      uploadFormData(),
    );

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(prepareUploadImageMock).not.toHaveBeenCalled();
  });

  it("fails closed while the Housing library capability is unavailable", async () => {
    authAs("user-1");
    dbMocks.getHostProfile.mockResolvedValueOnce({
      ...availableProfile(),
      benefitLibraryAvailable: false,
      benefitLibrary: {},
    });

    const result = await uploadHousingLibraryPhotoAction(
      "sleeping_area",
      uploadFormData(),
    );

    expect(result).toEqual({
      ok: false,
      error: "housing_library_unavailable",
    });
    expect(dbMocks.getHostProfile).toHaveBeenCalledWith(
      "session-token",
      "user-1",
    );
    expect(prepareUploadImageMock).not.toHaveBeenCalled();
    expect(dbMocks.uploadTrustedListingMedia).not.toHaveBeenCalled();
  });
});

describe("uploadHousingLibraryPhotoAction persistence", () => {
  it("returns image preparation failures without touching trusted storage", async () => {
    authAs("user-1");
    prepareUploadImageMock.mockResolvedValueOnce({
      ok: false,
      error: "Please choose a valid image.",
    });

    const formData = uploadFormData();
    const result = await uploadHousingLibraryPhotoAction(
      "sleeping_area",
      formData,
    );

    expect(result).toEqual({
      ok: false,
      error: "Please choose a valid image.",
    });
    expect(prepareUploadImageMock).toHaveBeenCalledWith(formData.get("file"));
    expect(dbMocks.uploadTrustedListingMedia).not.toHaveBeenCalled();
    expect(dbMocks.setMyHousingLibraryPhoto).not.toHaveBeenCalled();
  });

  it("uploads through trusted storage, binds immediately, cleans the replacement, and revalidates consumers", async () => {
    authAs("user-1");

    const result = await uploadHousingLibraryPhotoAction(
      "sleeping_area",
      uploadFormData(),
    );

    expect(result).toEqual({ ok: true, url: NEW_SLEEPING_URL });
    expect(dbMocks.uploadTrustedListingMedia).toHaveBeenCalledWith({
      path: expect.stringMatching(
        /^host-1\/library\/housing\/sleeping_area\/[0-9a-f-]+\.webp$/,
      ),
      bytes: PREPARED_BYTES,
      contentType: "image/webp",
    });
    expect(dbMocks.setMyHousingLibraryPhoto).toHaveBeenCalledWith(
      "session-token",
      "sleeping_area",
      NEW_SLEEPING_URL,
    );
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledWith(
      "host-1/library/housing/sleeping_area/old-sleeping.webp",
    );
    expect(
      dbMocks.uploadTrustedListingMedia.mock.invocationCallOrder[0],
    ).toBeLessThan(dbMocks.setMyHousingLibraryPhoto.mock.invocationCallOrder[0]);
    expect(
      dbMocks.setMyHousingLibraryPhoto.mock.invocationCallOrder[0],
    ).toBeLessThan(dbMocks.deleteTrustedListingMedia.mock.invocationCallOrder[0]);
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/host/profile"],
      ["/host/profile/edit"],
    ]);
    expect(revalidateTagMock.mock.calls).toEqual([
      ["host-profiles"],
      ["public-listings"],
    ]);
  });

  it("rolls back the newly uploaded object when immediate profile binding fails", async () => {
    authAs("user-1");
    dbMocks.setMyHousingLibraryPhoto.mockResolvedValueOnce({
      ok: false,
      error: "database_unavailable",
    });

    const result = await uploadHousingLibraryPhotoAction(
      "sleeping_area",
      uploadFormData(),
    );

    expect(result).toEqual({ ok: false, error: "database_unavailable" });
    const uploadedPath = dbMocks.uploadTrustedListingMedia.mock.calls[0][0]
      .path as string;
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledWith(uploadedPath);
    expect(dbMocks.deleteTrustedListingMedia).not.toHaveBeenCalledWith(
      "host-1/library/housing/sleeping_area/old-sleeping.webp",
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe("updateHostProfileAction Housing cleanup", () => {
  it("deletes only removed library objects after the profile update succeeds", async () => {
    authAs("user-1");

    const result = await updateHostProfileAction({
      benefitLibrary: {
        housing: { photos: { bathroom: OLD_BATHROOM_URL } },
      },
    });

    expect(result).toEqual({ ok: true });
    expect(dbMocks.updateHostProfileDetails).toHaveBeenCalledWith(
      "session-token",
      "user-1",
      {
        benefitLibrary: {
          housing: { photos: { bathroom: OLD_BATHROOM_URL } },
        },
      },
    );
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteTrustedListingMedia).toHaveBeenCalledWith(
      "host-1/library/housing/sleeping_area/old-sleeping.webp",
    );
    expect(
      dbMocks.updateHostProfileDetails.mock.invocationCallOrder[0],
    ).toBeLessThan(dbMocks.deleteTrustedListingMedia.mock.invocationCallOrder[0]);
  });
});
