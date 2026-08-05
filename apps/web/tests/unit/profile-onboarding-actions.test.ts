import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const queueRecomputeMock = vi.hoisted(() => vi.fn());
const isDevBenchEnabledMock = vi.hoisted(() => vi.fn());
const readDevRoleMock = vi.hoisted(() => vi.fn());
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
vi.mock("../../lib/devBench", () => ({
  isDevBenchEnabled: isDevBenchEnabledMock,
}));
vi.mock("../../lib/devBench/server", () => ({ readDevRole: readDevRoleMock }));
vi.mock("../../services/media", () => ({ prepareUploadImage: vi.fn() }));
vi.mock("../../services/media/trustedUploadGuard", () => ({
  guardTrustedUploadSlot: vi.fn(),
  hasTrustedUploadBudget: vi.fn(),
}));

import { createHostProfileAction } from "../../app/actions/hostProfile";
import {
  finishSeekerOnboarding,
  saveOnboardingStep,
} from "../../app/actions/seekerOnboarding";

function authAs(userId: string | null, token: string | null = "session-token") {
  const getToken = vi.fn().mockResolvedValue(token);
  authMock.mockResolvedValue({ userId, getToken });
  return getToken;
}

beforeEach(() => {
  vi.clearAllMocks();
  isDevBenchEnabledMock.mockReturnValue(false);
  readDevRoleMock.mockResolvedValue(null);
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

  it("rejects the derived mix category before auth or database work", async () => {
    const result = await createHostProfileAction({
      companyName: "Glacier Orchard",
      categoryScopes: ["mix" as never],
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
      saveOnboardingStep({ categories: ["farm"] }),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
    expect(queueRecomputeMock).not.toHaveBeenCalled();
  });

  it("sanitizes scored fields and queues recompute only after persistence", async () => {
    authAs("user-seeker");

    await expect(
      saveOnboardingStep({
        displayName: " River ",
        relativeLocation: " Bend, Oregon ",
        seekingTimeline: "1_month",
        remotePreference: "any",
        categories: ["farm", "invalid", "farm"],
        desiredRoles: [" Ranch hand ", "ranch hand", "Line cook"],
        generalSkills: [" Carpentry ", "carpentry", "Cooking"],
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        displayName: "River",
        relativeLocation: "Bend, Oregon",
        seekingTimeline: "1_month",
        remotePreference: "any",
        categories: ["farm"],
        desiredRoles: ["Ranch hand", "Line cook"],
        generalSkills: ["Carpentry", "Cooking"],
      },
    );
    expect(queueRecomputeMock).toHaveBeenCalledWith("user-seeker");
  });

  it("passes exact cent pay expectations through to persistence", async () => {
    authAs("user-seeker");

    await expect(
      saveOnboardingStep({
        displayName: "River",
        payExpectationMinCents: 1_750,
        payExpectationMaxCents: 2_025,
      }),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      {
        displayName: "River",
        payExpectationMinCents: 1_750,
        payExpectationMaxCents: 2_025,
      },
    );
  });

  it("does not turn a post-persist recompute registration fault into a failed save", async () => {
    authAs("user-seeker");
    queueRecomputeMock.mockImplementationOnce(() => {
      throw new Error("after unavailable");
    });

    await expect(
      saveOnboardingStep({ remotePreference: "hybrid" }),
    ).resolves.toEqual({ ok: true });
    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledOnce();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "saveOnboardingStep.postPersistRecompute",
        userId: "user-seeker",
      }),
    );
  });

  it("rejects malformed tag payloads before auth or database work", async () => {
    const result = await saveOnboardingStep({
      generalSkills: ["Cooking", 7],
    } as never);

    expect(result).toEqual({ ok: false, error: "invalid_tag_list" });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
  });

  it("uses an explicitly gated no-write path for the local seeker bench", async () => {
    isDevBenchEnabledMock.mockReturnValue(true);
    readDevRoleMock.mockResolvedValue("seeker");

    await expect(
      saveOnboardingStep({ remotePreference: "any" }),
    ).resolves.toEqual({ ok: true });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
  });
});

describe("finishSeekerOnboarding", () => {
  it("is the explicit completion writer and refreshes gated seeker surfaces", async () => {
    authAs("user-seeker");

    await expect(finishSeekerOnboarding()).resolves.toEqual({ ok: true });

    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      { onboardingComplete: true },
    );
    expect(queueRecomputeMock).not.toHaveBeenCalled();
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/onboarding"],
      ["/seek"],
      ["/profile"],
      ["/resume"],
    ]);
  });

  it("keeps durable completion successful when cache revalidation fails", async () => {
    authAs("user-seeker");
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    await expect(finishSeekerOnboarding()).resolves.toEqual({ ok: true });
    expect(dbMocks.saveSeekerProfile).toHaveBeenCalledOnce();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "finishSeekerOnboarding.postPersistRevalidate",
        userId: "user-seeker",
      }),
    );
  });

  it("finishes the local seeker bench without touching auth or data", async () => {
    isDevBenchEnabledMock.mockReturnValue(true);
    readDevRoleMock.mockResolvedValue("seeker");

    await expect(finishSeekerOnboarding()).resolves.toEqual({ ok: true });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.saveSeekerProfile).not.toHaveBeenCalled();
  });
});
