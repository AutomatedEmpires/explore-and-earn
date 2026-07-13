import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  activateHostAnnouncement: vi.fn(),
  countHostAnnouncementsThisMonth: vi.fn(),
  deleteCommunityPhoto: vi.fn(),
  deleteStorageObject: vi.fn(),
  getComments: vi.fn(),
  getCommenterName: vi.fn(),
  getHostTierAndProfile: vi.fn(),
  getOwnedPhotoPath: vi.fn(),
  getSeekerCompletionScore: vi.fn(),
  insertComment: vi.fn(),
  insertCommunityPhoto: vi.fn(),
  insertCommunityPhotoReport: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  softDeleteComment: vi.fn(),
  toggleAnnouncementReaction: vi.fn(),
  togglePhotoReaction: vi.fn(),
  uploadCommunityPhotoStorage: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../services/stripe", () => ({
  createAnnouncementCheckoutSession: vi.fn(),
}));

import {
  deleteCommunityPhotoAction,
  uploadCommunityPhotoAction,
} from "../../app/actions/community";

describe("community photo privacy boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      userId: `user_${crypto.randomUUID()}`,
      getToken: vi.fn().mockResolvedValue("session-token"),
    });
    dbMocks.getSeekerCompletionScore.mockResolvedValue({
      completionScore: 100,
      seekerProfileId: "seeker-profile-id",
    });
    dbMocks.getOwnedPhotoPath.mockResolvedValue("seeker-profile-id/photo.webp");
    dbMocks.uploadCommunityPhotoStorage.mockResolvedValue("seeker-profile-id/photo.webp");
    dbMocks.insertCommunityPhoto.mockResolvedValue({ id: "photo-id" });
  });

  it("rejects a compressed image whose decoded dimensions exceed 40 megapixels", async () => {
    const compressed = await sharp({
      create: {
        width: 6_500,
        height: 6_200,
        channels: 3,
        background: "white",
      },
    })
      .jpeg({ quality: 1 })
      .toBuffer();
    expect(compressed.byteLength).toBeLessThan(10 * 1024 * 1024);

    const formData = new FormData();
    formData.set("privacy_consent", "accepted");
    formData.set("photo", new File([new Uint8Array(compressed)], "compressed.jpg", {
      type: "image/jpeg",
    }));

    await expect(uploadCommunityPhotoAction(formData)).resolves.toEqual({
      ok: false,
      reason: "upload_failed",
    });
    expect(dbMocks.uploadCommunityPhotoStorage).not.toHaveBeenCalled();
  });

  it("does not hide the database row when deleting the public object fails", async () => {
    dbMocks.deleteStorageObject.mockRejectedValue(new Error("storage unavailable"));

    await expect(deleteCommunityPhotoAction("photo-id")).rejects.toThrow("storage unavailable");

    expect(dbMocks.deleteCommunityPhoto).not.toHaveBeenCalled();
  });
});
