import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const saveSeekerProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@explore-and-earn/db", () => ({
  saveSeekerProfile: saveSeekerProfileMock,
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import { saveReadinessAction } from "../../app/actions/seekerProfile";
import {
  READINESS_FAILURE_MESSAGE,
  READINESS_SAVED_MESSAGE,
  READINESS_TIMELINES,
  initialReadinessState,
  normalizeTimeline,
  readinessReducer,
} from "../../lib/readiness";

function authAs(userId: string | null, token: string | null = "session-token") {
  const getToken = vi.fn().mockResolvedValue(token);
  authMock.mockResolvedValue({ userId, getToken });
  return getToken;
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs("user-seeker");
  saveSeekerProfileMock.mockResolvedValue({ ok: true });
});

describe("readiness model", () => {
  it("defines and normalizes only the four canonical timelines", () => {
    expect(READINESS_TIMELINES).toEqual([
      "now",
      "1_month",
      "3_months",
      "6_months",
    ]);
    for (const timeline of READINESS_TIMELINES) {
      expect(normalizeTimeline(timeline)).toBe(timeline);
    }
    expect(normalizeTimeline(null)).toBeNull();
    expect(normalizeTimeline(undefined)).toBeNull();
    expect(normalizeTimeline(" now ")).toBeNull();
    expect(normalizeTimeline("12_months")).toBeNull();
  });

  it("keeps null unset, permits null to now, ignores overlap, and rolls back failure", () => {
    const initial = initialReadinessState(null);
    expect(initial).toEqual({
      committed: null,
      displayed: null,
      phase: "idle",
      message: null,
    });

    const saving = readinessReducer(initial, { type: "begin", timeline: "now" });
    expect(saving).toEqual({
      committed: null,
      displayed: "now",
      phase: "saving",
      message: null,
    });
    expect(
      readinessReducer(saving, { type: "begin", timeline: "1_month" }),
    ).toBe(saving);
    expect(
      readinessReducer(saving, { type: "sync", timeline: "3_months" }),
    ).toBe(saving);
    expect(
      readinessReducer(saving, { type: "hydrate", timeline: "6_months" }),
    ).toBe(saving);

    const failed = readinessReducer(saving, { type: "failed" });
    expect(failed).toEqual({
      committed: null,
      displayed: null,
      phase: "error",
      message: READINESS_FAILURE_MESSAGE,
    });
    expect(readinessReducer(failed, { type: "dismiss" })).toEqual(initial);
  });

  it("commits a successful save and later synchronizes fresh server state", () => {
    const saving = readinessReducer(initialReadinessState("1_month"), {
      type: "begin",
      timeline: "now",
    });
    const saved = readinessReducer(saving, {
      type: "succeeded",
      timeline: "now",
    });

    expect(saved).toEqual({
      committed: "now",
      displayed: "now",
      phase: "saved",
      message: READINESS_SAVED_MESSAGE,
    });
    expect(
      readinessReducer(saved, { type: "sync", timeline: "3_months" }),
    ).toEqual({
      committed: "3_months",
      displayed: "3_months",
      phase: "idle",
      message: null,
    });
  });

  it("rolls a failed save back to the newest deferred server value", () => {
    const saving = readinessReducer(initialReadinessState("1_month"), {
      type: "begin",
      timeline: "now",
    });
    const failed = readinessReducer(saving, {
      type: "failed",
      rollbackTo: "3_months",
    });

    expect(failed).toEqual({
      committed: "3_months",
      displayed: "3_months",
      phase: "error",
      message: READINESS_FAILURE_MESSAGE,
    });
  });
});

describe("saveReadinessAction", () => {
  it.each([null, undefined, "", " now ", "12_months", {}, 7])(
    "rejects invalid input %j before auth or persistence",
    async (value) => {
      await expect(saveReadinessAction(value)).resolves.toEqual({
        ok: false,
        error: "invalid_timeline",
      });
      expect(authMock).not.toHaveBeenCalled();
      expect(saveSeekerProfileMock).not.toHaveBeenCalled();
    },
  );

  it("returns a stable unauthenticated failure without persistence", async () => {
    authAs(null);

    await expect(saveReadinessAction("now")).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(saveSeekerProfileMock).not.toHaveBeenCalled();
  });

  it("treats a missing session token as unauthenticated", async () => {
    authAs("user-seeker", null);

    await expect(saveReadinessAction("now")).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(saveSeekerProfileMock).not.toHaveBeenCalled();
  });

  it("maps authentication faults to a stable temporary failure", async () => {
    authMock.mockRejectedValueOnce(new Error("identity unavailable"));

    await expect(saveReadinessAction("1_month")).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(saveSeekerProfileMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: "saveReadinessAction.authenticate" }),
    );
  });

  it("never exposes a raw persistence error", async () => {
    saveSeekerProfileMock.mockResolvedValueOnce({
      ok: false,
      error: "relation seeker_profiles is unavailable",
    });

    await expect(saveReadinessAction("3_months")).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("maps thrown persistence faults to the same stable temporary failure", async () => {
    const persistenceError = new Error("connection reset");
    saveSeekerProfileMock.mockRejectedValueOnce(persistenceError);

    await expect(saveReadinessAction("3_months")).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledWith(persistenceError, {
      action: "saveReadinessAction.persist",
      userId: "user-seeker",
    });
  });

  it("persists the normalized timeline and revalidates every owning surface", async () => {
    await expect(saveReadinessAction("6_months")).resolves.toEqual({
      ok: true,
      timeline: "6_months",
    });
    expect(saveSeekerProfileMock).toHaveBeenCalledWith(
      "session-token",
      "user-seeker",
      { seekingTimeline: "6_months" },
    );
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/home"],
      ["/profile"],
      ["/resume"],
    ]);
  });

  it("keeps durable success and attempts later paths when one revalidation throws", async () => {
    const cacheError = new Error("home cache unavailable");
    revalidatePathMock.mockImplementation((path: string) => {
      if (path === "/home") throw cacheError;
    });

    await expect(saveReadinessAction("now")).resolves.toEqual({
      ok: true,
      timeline: "now",
    });
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/home"],
      ["/profile"],
      ["/resume"],
    ]);
    expect(reportErrorMock).toHaveBeenCalledWith(cacheError, {
      action: "saveReadinessAction.postPersistRevalidate",
      route: "/home",
      userId: "user-seeker",
    });
  });
});
