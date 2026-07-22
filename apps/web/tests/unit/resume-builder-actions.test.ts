import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const queueRecomputeMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  updateSeekerProfileBio: vi.fn(),
  updateSeekerProfileInfo: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/matchRecompute", () => ({
  queueSeekerMatchRecompute: queueRecomputeMock,
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import { saveInfoAction } from "../../app/actions/resumeBuilder";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-seeker",
    getToken: vi.fn().mockResolvedValue("session-token"),
  });
  dbMocks.updateSeekerProfileBio.mockResolvedValue({ ok: true });
  dbMocks.updateSeekerProfileInfo.mockResolvedValue({ ok: true });
});

describe("saveInfoAction partial resume updates", () => {
  it("preserves skills when the Info step saves its fields", async () => {
    await expect(
      saveInfoAction({
        displayName: "  Casey Trail  ",
        location: "  Bend, Oregon  ",
        seekingTimeline: "now",
        bio: "  Ready for seasonal work.  ",
        desiredCategories: ["farm", "seasonal"],
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.updateSeekerProfileInfo).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        displayName: "Casey Trail",
        location: "Bend, Oregon",
        seekingTimeline: "now",
        desiredCategories: ["farm", "seasonal"],
      },
    );
    expect(dbMocks.updateSeekerProfileBio).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      { bio: "Ready for seasonal work." },
    );
  });

  it("preserves Info fields when the Skills step saves its fields", async () => {
    await expect(
      saveInfoAction({ generalSkills: ["Animal care", "Carpentry"] }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.updateSeekerProfileInfo).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      { generalSkills: ["Animal care", "Carpentry"] },
    );
    expect(dbMocks.updateSeekerProfileBio).not.toHaveBeenCalled();
  });

  it("still clears fields when the caller explicitly supplies blanks", async () => {
    await expect(
      saveInfoAction({
        displayName: "  ",
        location: "",
        seekingTimeline: "",
        desiredCategories: [],
        generalSkills: [],
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.updateSeekerProfileInfo).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        displayName: null,
        location: null,
        seekingTimeline: null,
        desiredCategories: [],
        generalSkills: [],
      },
    );
  });
});
