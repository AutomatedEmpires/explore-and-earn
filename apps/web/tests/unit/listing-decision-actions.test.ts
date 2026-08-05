import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const lockMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  getPassedListingIds: vi.fn(),
  getSavedListingIds: vi.fn(),
  passListing: vi.fn(),
  saveListing: vi.fn(),
  unpassListing: vi.fn(),
  unsaveListing: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: rateLimitMock,
}));
vi.mock("../../lib/listingDecisionLock", () => ({
  withListingDecisionLock: lockMock,
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import {
  restoreListingDecisionAction,
  setListingDecisionAction,
} from "../../app/actions/mapDecisions";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-1",
    getToken: vi.fn().mockResolvedValue("session-token"),
  });
  rateLimitMock.mockResolvedValue({ allowed: true });
  lockMock.mockImplementation(
    async (_userId: string, _listingId: string, work: () => Promise<unknown>) => ({
      acquired: true,
      value: await work(),
    }),
  );
  dbMocks.getSavedListingIds.mockResolvedValue([]);
  dbMocks.getPassedListingIds.mockResolvedValue([]);
  dbMocks.saveListing.mockResolvedValue({ ok: true });
  dbMocks.unsaveListing.mockResolvedValue({ ok: true });
  dbMocks.passListing.mockResolvedValue({ ok: true });
  dbMocks.unpassListing.mockResolvedValue({ ok: true });
});

describe("listing decision server actions", () => {
  it("returns a client-safe unauthenticated reason without locking", async () => {
    authMock.mockResolvedValue({
      userId: null,
      getToken: vi.fn(),
    });

    const result = await setListingDecisionAction(LISTING_ID, "saved");

    expect(result).toEqual({
      ok: false,
      consistent: false,
      failureReason: "unauthenticated",
    });
    expect(lockMock).not.toHaveBeenCalled();
  });

  it("returns a client-safe rate-limit reason without locking", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false });

    const result = await setListingDecisionAction(LISTING_ID, "saved");

    expect(result).toEqual({
      ok: false,
      consistent: false,
      failureReason: "rate_limit_exceeded",
    });
    expect(lockMock).not.toHaveBeenCalled();
  });

  it("returns the authoritative prior decision from inside the lock", async () => {
    dbMocks.getPassedListingIds.mockResolvedValue([LISTING_ID]);

    const result = await setListingDecisionAction(LISTING_ID, "saved");

    expect(lockMock).toHaveBeenCalledWith("user-1", LISTING_ID, expect.any(Function));
    expect(dbMocks.unpassListing).toHaveBeenCalledWith(
      "session-token",
      "user-1",
      LISTING_ID,
    );
    expect(dbMocks.saveListing).toHaveBeenCalledWith(
      "session-token",
      "user-1",
      LISTING_ID,
    );
    expect(result).toEqual({
      ok: true,
      decision: "saved",
      previousDecision: "skipped",
      consistent: true,
    });
  });

  it("fails closed without reading or writing when the lock is unavailable", async () => {
    lockMock.mockResolvedValue({ acquired: false, reason: "unavailable" });

    const result = await setListingDecisionAction(LISTING_ID, "saved");

    expect(result).toEqual({
      ok: false,
      consistent: false,
      failureReason: "temporarily_unavailable",
    });
    expect(dbMocks.getSavedListingIds).not.toHaveBeenCalled();
    expect(dbMocks.getPassedListingIds).not.toHaveBeenCalled();
    expect(dbMocks.saveListing).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });

  it("restores an empty prior state when the expected decision is current", async () => {
    dbMocks.getSavedListingIds.mockResolvedValue([LISTING_ID]);

    const result = await restoreListingDecisionAction(
      LISTING_ID,
      "saved",
      null,
    );

    expect(dbMocks.unsaveListing).toHaveBeenCalledWith(
      "session-token",
      "user-1",
      LISTING_ID,
    );
    expect(dbMocks.passListing).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      decision: null,
      previousDecision: "saved",
      consistent: true,
    });
  });

  it("restores the opposite prior decision with the exclusive transition", async () => {
    dbMocks.getSavedListingIds.mockResolvedValue([LISTING_ID]);

    const result = await restoreListingDecisionAction(
      LISTING_ID,
      "saved",
      "skipped",
    );

    expect(dbMocks.unsaveListing).toHaveBeenCalledBefore(dbMocks.passListing);
    expect(result).toEqual({
      ok: true,
      decision: "skipped",
      previousDecision: "saved",
      consistent: true,
    });
  });

  it("does not let Undo overwrite a later concurrent choice", async () => {
    dbMocks.getSavedListingIds.mockResolvedValue([LISTING_ID]);

    const result = await restoreListingDecisionAction(
      LISTING_ID,
      "skipped",
      null,
    );

    expect(result).toEqual({
      ok: false,
      decision: "saved",
      previousDecision: "saved",
      consistent: true,
      conflict: true,
      failureReason: "conflict",
    });
    expect(dbMocks.saveListing).not.toHaveBeenCalled();
    expect(dbMocks.unsaveListing).not.toHaveBeenCalled();
    expect(dbMocks.passListing).not.toHaveBeenCalled();
    expect(dbMocks.unpassListing).not.toHaveBeenCalled();
  });

  it("rejects malformed input before auth or locking", async () => {
    const result = await restoreListingDecisionAction(
      "not-a-listing-id",
      "saved",
      null,
    );

    expect(result).toEqual({
      ok: false,
      consistent: false,
      failureReason: "invalid_input",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(lockMock).not.toHaveBeenCalled();
  });
});
