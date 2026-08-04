import { beforeEach, describe, expect, it, vi } from "vitest";

const setDecisionMock = vi.hoisted(() => vi.fn());
const restoreDecisionMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/actions/mapDecisions", () => ({
  setListingDecisionAction: setDecisionMock,
  restoreListingDecisionAction: restoreDecisionMock,
}));
vi.mock("../../app/actions/applications", () => ({
  applyToListingAction: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("../../components/discovery/data", () => ({
  getSwipeListings: vi.fn(),
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import {
  saveListingAction as saveFromListingAction,
  unsaveListingAction,
} from "../../app/actions/savedListings";
import {
  passListingAction,
  saveListingAction as saveFromSwipeAction,
  unpassListingAction,
} from "../../app/actions/swipe";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "user-1", getToken: vi.fn() });
});

describe("legacy listing decision action adapters", () => {
  it("routes listing-detail Save through the exclusive action", async () => {
    setDecisionMock.mockResolvedValue({
      ok: true,
      decision: "saved",
      previousDecision: "skipped",
      consistent: true,
    });

    await expect(saveFromListingAction(LISTING_ID)).resolves.toEqual({ ok: true });
    expect(setDecisionMock).toHaveBeenCalledWith(LISTING_ID, "saved");
  });

  it.each([
    ["unauthenticated", "unauthenticated"],
    ["rate_limit_exceeded", "rate_limit_exceeded"],
    ["temporarily_unavailable", "failed"],
  ] as const)(
    "maps %s to the saved-listing public failure contract",
    async (failureReason, error) => {
      setDecisionMock.mockResolvedValue({
        ok: false,
        consistent: false,
        failureReason,
      });

      await expect(saveFromListingAction(LISTING_ID)).resolves.toEqual({
        ok: false,
        error,
      });
    },
  );

  it("conditionally clears Save and preserves /saved revalidation", async () => {
    restoreDecisionMock.mockResolvedValue({
      ok: true,
      decision: null,
      previousDecision: "saved",
      consistent: true,
    });

    await expect(unsaveListingAction(LISTING_ID)).resolves.toEqual({ ok: true });
    expect(restoreDecisionMock).toHaveBeenCalledWith(
      LISTING_ID,
      "saved",
      null,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/saved");
  });

  it("treats an already-absent Save as idempotent without clearing Skip", async () => {
    restoreDecisionMock.mockResolvedValue({
      ok: false,
      decision: "skipped",
      previousDecision: "skipped",
      consistent: true,
      conflict: true,
      failureReason: "conflict",
    });

    await expect(unsaveListingAction(LISTING_ID)).resolves.toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/saved");
  });

  it("does not claim Unsave succeeded for contradictory persistence", async () => {
    restoreDecisionMock.mockResolvedValue({
      ok: false,
      decision: null,
      previousDecision: null,
      consistent: false,
      conflict: true,
      failureReason: "conflict",
    });

    await expect(unsaveListingAction(LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "failed",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("derives Swipe's alreadySaved flag from the locked prior decision", async () => {
    setDecisionMock.mockResolvedValue({
      ok: true,
      decision: "saved",
      previousDecision: "saved",
      consistent: true,
    });

    await expect(saveFromSwipeAction(LISTING_ID)).resolves.toEqual({
      ok: true,
      alreadySaved: true,
    });
    expect(setDecisionMock).toHaveBeenCalledWith(LISTING_ID, "saved");
  });

  it("routes Pass through the exclusive action", async () => {
    setDecisionMock.mockResolvedValue({
      ok: true,
      decision: "skipped",
      previousDecision: null,
      consistent: true,
    });

    await expect(passListingAction(LISTING_ID)).resolves.toEqual({ ok: true });
    expect(setDecisionMock).toHaveBeenCalledWith(LISTING_ID, "skipped");
  });

  it("conditionally clears Pass and is idempotent after another choice", async () => {
    restoreDecisionMock.mockResolvedValue({
      ok: false,
      decision: "saved",
      previousDecision: "saved",
      consistent: true,
      conflict: true,
      failureReason: "conflict",
    });

    await expect(unpassListingAction(LISTING_ID)).resolves.toEqual({ ok: true });
    expect(restoreDecisionMock).toHaveBeenCalledWith(
      LISTING_ID,
      "skipped",
      null,
    );
  });
});
