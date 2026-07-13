import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let inserted: Record<string, unknown> | null = null;

vi.mock("../src/client", () => ({
  authedClient: () => ({
    from: () => ({
      insert: (value: Record<string, unknown>) => {
        inserted = value;
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const { insertCommunityPhotoReport } = await import("../src/queries/community");

describe("insertCommunityPhotoReport", () => {
  beforeEach(() => {
    inserted = null;
  });

  it("writes only columns granted to authenticated reporters", async () => {
    await insertCommunityPhotoReport("session-token", {
      photoId: "photo-id",
      reporterClerkUserId: "user-id",
      reason: "privacy",
      detail: "Please review",
    });

    expect(inserted).toEqual({
      photo_id: "photo-id",
      reporter_clerk_user_id: "user-id",
      reason: "privacy",
      detail: "Please review",
    });
    expect(inserted).not.toHaveProperty("status");
  });
});
