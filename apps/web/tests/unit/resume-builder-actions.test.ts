import { beforeEach, describe, expect, it, vi } from "vitest";

import { RESUME_EXPERIENCE_IDENTITY_REQUIRED } from "@explore-and-earn/contracts";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const queueRecomputeMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  addResumeExperience: vi.fn(),
  updateResumeExperience: vi.fn(),
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

import {
  addExperienceAction,
  saveInfoAction,
  updateExperienceAction,
} from "../../app/actions/resumeBuilder";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-seeker",
    getToken: vi.fn().mockResolvedValue("session-token"),
  });
  dbMocks.updateSeekerProfileBio.mockResolvedValue({ ok: true });
  dbMocks.updateSeekerProfileInfo.mockResolvedValue({ ok: true });
  dbMocks.addResumeExperience.mockResolvedValue({ ok: true, id: "experience-1" });
  dbMocks.updateResumeExperience.mockResolvedValue({ ok: true });
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

describe("resume experience identity actions", () => {
  const baseExperience = {
    roleTitle: null,
    companyName: null,
    location: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    summary: undefined,
    categoryTags: [],
    skillTags: [],
  };

  it("authenticates before returning the stable identity validation error", async () => {
    authMock.mockResolvedValue({
      userId: null,
      getToken: vi.fn(),
    });

    await expect(addExperienceAction(baseExperience)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(dbMocks.addResumeExperience).not.toHaveBeenCalled();
  });

  it("rejects an authenticated whitespace-only identity without touching the DB", async () => {
    await expect(
      addExperienceAction({
        ...baseExperience,
        roleTitle: "   ",
        companyName: "\t",
      }),
    ).resolves.toEqual({
      ok: false,
      error: RESUME_EXPERIENCE_IDENTITY_REQUIRED,
    });
    expect(dbMocks.addResumeExperience).not.toHaveBeenCalled();
  });

  it("trims both fields and writes an explicit null when role alone identifies the entry", async () => {
    await expect(
      addExperienceAction({
        ...baseExperience,
        roleTitle: "  Trail guide  ",
        companyName: "   ",
      }),
    ).resolves.toEqual({ ok: true, id: "experience-1" });

    expect(dbMocks.addResumeExperience).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        ...baseExperience,
        roleTitle: "Trail guide",
        companyName: null,
      },
    );
  });

  it("accepts employer-only updates and normalizes the missing role to null", async () => {
    await expect(
      updateExperienceAction("experience-1", {
        ...baseExperience,
        roleTitle: " ",
        companyName: "  Cascade Orchard  ",
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.updateResumeExperience).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      "experience-1",
      {
        ...baseExperience,
        roleTitle: null,
        companyName: "Cascade Orchard",
      },
    );
  });

  it("conceals persistence errors behind the generic action error", async () => {
    dbMocks.addResumeExperience.mockResolvedValue({
      ok: false,
      error: "raw database detail",
    });

    await expect(
      addExperienceAction({
        ...baseExperience,
        roleTitle: "Guide",
      }),
    ).resolves.toEqual({ ok: false, error: "unexpected_error" });
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });

  it("reports cache refresh faults without turning a durable add into a failed save", async () => {
    revalidatePathMock
      .mockImplementationOnce(() => {
        throw new Error("resume cache unavailable");
      })
      .mockImplementationOnce(() => undefined);

    await expect(
      addExperienceAction({
        ...baseExperience,
        roleTitle: "Guide",
      }),
    ).resolves.toEqual({ ok: true, id: "experience-1" });

    expect(dbMocks.addResumeExperience).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, "/resume");
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, "/profile");
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      {
        action: "resumeBuilder.revalidate",
        route: "/resume",
      },
    );
  });

  it("reports cache refresh faults without turning a durable update into a failed save", async () => {
    revalidatePathMock
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("profile cache unavailable");
      });

    await expect(
      updateExperienceAction("experience-1", {
        ...baseExperience,
        companyName: "Cascade Orchard",
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.updateResumeExperience).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, "/resume");
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, "/profile");
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      {
        action: "resumeBuilder.revalidate",
        route: "/profile",
      },
    );
  });
});
