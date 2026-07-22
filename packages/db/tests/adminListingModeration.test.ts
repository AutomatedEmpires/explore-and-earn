import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("../src/adminClient", () => ({
  adminClient: mocks.adminClient,
}));

const { adminApproveListing, adminCloseListing, adminHoldListing } =
  await import("../src/queries/admin");

function buildChain(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const chain = {
    update: mocks.update,
    eq: mocks.eq,
    select: mocks.select,
    maybeSingle: mocks.maybeSingle,
  };

  mocks.adminClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue(result);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("admin listing moderation transitions", () => {
  it("atomically approves only a listing that is under review", async () => {
    buildChain({ data: { id: "listing-1" }, error: null });

    const result = await adminApproveListing("service-key", "listing-1");

    expect(result).toEqual({ ok: true });
    expect(mocks.from).toHaveBeenCalledWith("listings");
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({ status: "live" });
    expect(mocks.eq.mock.calls).toEqual([
      ["id", "listing-1"],
      ["status", "under_review"],
    ]);
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
  });

  it("does not report approval success when no reviewable row changed", async () => {
    buildChain({ data: null, error: null });

    await expect(
      adminApproveListing("service-key", "listing-1"),
    ).resolves.toEqual({
      ok: false,
      error: "Listing is no longer awaiting review.",
    });
  });

  it("returns the database error when approval fails", async () => {
    buildChain({ data: null, error: { message: "database unavailable" } });

    await expect(
      adminApproveListing("service-key", "listing-1"),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
  });

  it("closes only a listing that is under review", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:34:56.000Z"));
    buildChain({ data: { id: "listing-2" }, error: null });

    const result = await adminCloseListing(
      "service-key",
      "listing-2",
      "Incomplete listing",
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({
      status: "closed",
      closed_at: "2026-07-21T12:34:56.000Z",
    });
    expect(mocks.eq.mock.calls).toEqual([
      ["id", "listing-2"],
      ["status", "under_review"],
    ]);
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
  });

  it("does not report rejection success when no reviewable row changed", async () => {
    buildChain({ data: null, error: null });

    await expect(
      adminCloseListing("service-key", "listing-2"),
    ).resolves.toEqual({
      ok: false,
      error: "Listing is no longer awaiting review.",
    });
  });

  it("returns the database error when rejection fails", async () => {
    buildChain({ data: null, error: { message: "write failed" } });

    await expect(
      adminCloseListing("service-key", "listing-2"),
    ).resolves.toEqual({ ok: false, error: "write failed" });
  });

  it("returns an under-review listing to draft when held", async () => {
    buildChain({ data: { id: "listing-3" }, error: null });

    const result = await adminHoldListing("service-key", "listing-3");

    expect(result).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({ status: "draft" });
    expect(mocks.eq.mock.calls).toEqual([
      ["id", "listing-3"],
      ["status", "under_review"],
    ]);
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
  });

  it("does not report hold success when no reviewable row changed", async () => {
    buildChain({ data: null, error: null });

    await expect(
      adminHoldListing("service-key", "listing-3"),
    ).resolves.toEqual({
      ok: false,
      error: "Listing is no longer awaiting review.",
    });
  });
});
