import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const queueRecomputeMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  createHostProfile: vi.fn(),
  deleteTrustedListingMedia: vi.fn(),
  getHostProfile: vi.fn(),
  saveSeekerProfile: vi.fn(),
  setMyHousingLibraryPhoto: vi.fn(),
  updateHostProfileDetails: vi.fn(),
  uploadTrustedListingMedia: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: vi.fn(),
}));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/serverCache", () => ({
  HOST_PROFILES_CACHE_TAG: "host-profiles",
  LISTINGS_CACHE_TAG: "public-listings",
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../lib/matchRecompute", () => ({
  queueSeekerMatchRecompute: queueRecomputeMock,
}));
vi.mock("../../services/media", () => ({ prepareUploadImage: vi.fn() }));
vi.mock("../../services/media/trustedUploadGuard", () => ({
  guardTrustedUploadSlot: vi.fn(),
  hasTrustedUploadBudget: vi.fn(),
}));

import { createHostProfileAction } from "../../app/actions/hostProfile";
import { saveOnboardingStep } from "../../app/actions/seekerOnboarding";

function authAs(userId: string | null, token: string | null = "session-token") {
  const getToken = vi.fn().mockResolvedValue(token);
  authMock.mockResolvedValue({ userId, getToken });
  return getToken;
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs("user-default");
  dbMocks.createHostProfile.mockResolvedValue({ ok: true, id: "host-1" });
  dbMocks.saveSeekerProfile.mockResolvedValue({ ok: true });
});

describe("createHostProfileAction", () => {
  it("normalizes and persists company, lanes, and optional location", async () => {
    authAs("user-host");

    await expect(
      createHostProfileAction({
        companyName: "  Glacier Orchard  ",
        categoryScopes: ["farm", "remote", "farm"],
        primaryLocationName: "  Wenatchee, Washington  ",
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.createHostProfile).toHaveBeenCalledWith("session-token", {
      companyName: "Glacier Orchard",
      categoryScopes: ["farm", "remote"],
      primaryLocationName: "Wenatchee, Washington",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/host");
  });

  it("rejects missing lanes before auth or database work", async () => {
    const result = await createHostProfileAction({
      companyName: "Glacier Orchard",
      categoryScopes: [],
      primaryLocationName: null,
    });

    expect(result).toEqual({ ok: false, error: "lanes_required" });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.createHostProfile).not.toHaveBeenCalled();
  });

  it("maps a soft-deleted identity to a stable account error", async () => {
    authAs("user-host");
    dbMocks.createHostProfile.mockResolvedValueOnce({
      ok: false,
      error: "profile_identity_disabled",
    });

    await expect(
      createHostProfileAction({
        companyName: "Glacier Orchard",
        categoryScopes: ["farm"],
        primaryLocationName: null,
      }),
    ).resolves.toEqual({ ok: false, error: "account_unavailable" });
  });
});

describe("saveOnboardingStep", () => {
  it("does not queue a match recompute when persistence fails", async () => {
    authAs("user-seeker");
    dbMocks.saveSeekerProfile.mockResolvedValueOnce({
      ok: false,
      error: "database unavailable",
    });

    await expect(
      saveOnboardingStep({ categories: ["farm"], complete: true }),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
    expect(queueRecomputeMock).not.toHaveBeenCalled();
  });

  it("sanitizes scored fields and queues recompute only after persistence", async () => {
    authAs("user-seeker");

    await expect(
      saveOnboardingStep({
        categories: ["farm", "invalid", "farm"],
        freeformSkills: [" Carpentry ", "carpentry", "Cooking"],
        complete: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        categories: ["farm"],
        freeformSkills: ["Carpentry", "Cooking"],
        onboardingComplete: true,
      },
    );
    expect(queueRecomputeMock).toHaveBeenCalledWith("user-seeker");
  });
});
