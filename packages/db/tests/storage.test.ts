import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("../src/client", () => ({
  authedClient: () => ({
    storage: { from: storageMocks.from },
  }),
}));

import {
  uploadCommunityPhotoStorage,
  uploadListingMedia,
} from "../src/storage";

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({
    upload: storageMocks.upload,
    getPublicUrl: storageMocks.getPublicUrl,
  });
  storageMocks.upload.mockResolvedValue({ error: null });
  storageMocks.getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://example.test/storage/object.webp" },
  });
});

describe("Storage upload conflict behavior", () => {
  it("uses INSERT-only uploads for unique community photo paths", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.webp", {
      type: "image/webp",
    });

    await expect(
      uploadCommunityPhotoStorage(
        "clerk-token",
        "seeker-profile-id",
        "photo-id.webp",
        file,
      ),
    ).resolves.toBe("seeker-profile-id/photo-id.webp");

    expect(storageMocks.from).toHaveBeenCalledWith("community-photos");
    expect(storageMocks.upload).toHaveBeenCalledWith(
      "seeker-profile-id/photo-id.webp",
      file,
      {
        upsert: false,
        cacheControl: "3600",
        contentType: "image/webp",
      },
    );
  });

  it("preserves overwrite behavior for deterministic listing slots", async () => {
    const file = new File([new Uint8Array([1])], "cover.webp", {
      type: "image/webp",
    });

    await uploadListingMedia("clerk-token", "host-profile-id", file, "cover");

    expect(storageMocks.upload).toHaveBeenCalledWith(
      "host-profile-id/cover",
      file,
      {
        upsert: true,
        cacheControl: "3600",
        contentType: "image/webp",
      },
    );
  });
});
