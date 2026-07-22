import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
const isCurrentUserAdminMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const computeMatchesMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  adminApproveListing: vi.fn(),
  adminCloseListing: vi.fn(),
  adminHoldListing: vi.fn(),
  adminSetHostAttestationStatus: vi.fn(),
  clearHostFlag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/admin", () => ({
  isCurrentUserAdmin: isCurrentUserAdminMock,
}));
vi.mock("../../lib/serverCache", () => ({
  LISTINGS_CACHE_TAG: "public-listings",
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/matching", () => ({
  computeAndStoreMatchesForListing: computeMatchesMock,
}));

vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const { approveListingAction, holdListingAction, rejectListingAction } =
  await import("../../app/actions/admin");

beforeEach(() => {
  vi.clearAllMocks();
  isCurrentUserAdminMock.mockResolvedValue(true);
  dbMocks.adminApproveListing.mockResolvedValue({ ok: true });
  dbMocks.adminHoldListing.mockResolvedValue({ ok: true });
  dbMocks.adminCloseListing.mockResolvedValue({ ok: true });
  computeMatchesMock.mockResolvedValue(undefined);
});

describe("admin listing review actions", () => {
  it("denies non-admin callers before any moderation write", async () => {
    isCurrentUserAdminMock.mockResolvedValue(false);

    await expect(holdListingAction("listing-1")).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(dbMocks.adminHoldListing).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("approves, computes matches, and refreshes affected surfaces", async () => {
    await expect(approveListingAction("listing-1")).resolves.toEqual({
      ok: true,
    });

    expect(dbMocks.adminApproveListing).toHaveBeenCalledWith(
      "test-service-key",
      "listing-1",
    );
    expect(computeMatchesMock).toHaveBeenCalledWith("listing-1");
    expect(revalidateTagMock).toHaveBeenCalledWith("public-listings");
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/listings"],
      ["/listings/listing-1"],
      ["/admin"],
    ]);
  });

  it("does not score or refresh after a stale approval decision", async () => {
    dbMocks.adminApproveListing.mockResolvedValue({
      ok: false,
      error: "Listing is no longer awaiting review.",
    });

    await expect(approveListingAction("listing-1")).resolves.toEqual({
      ok: false,
      error: "Listing is no longer awaiting review.",
    });
    expect(computeMatchesMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("holds a reviewable listing and refreshes affected surfaces", async () => {
    await expect(holdListingAction("listing-2")).resolves.toEqual({ ok: true });

    expect(dbMocks.adminHoldListing).toHaveBeenCalledWith(
      "test-service-key",
      "listing-2",
    );
    expect(computeMatchesMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith("public-listings");
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/listings"],
      ["/listings/listing-2"],
      ["/admin"],
    ]);
  });

  it("rejects a reviewable listing and forwards the reason", async () => {
    await expect(
      rejectListingAction("listing-3", "Safety risk"),
    ).resolves.toEqual({ ok: true });

    expect(dbMocks.adminCloseListing).toHaveBeenCalledWith(
      "test-service-key",
      "listing-3",
      "Safety risk",
    );
    expect(computeMatchesMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith("public-listings");
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/listings"],
      ["/listings/listing-3"],
      ["/admin"],
    ]);
  });
});
