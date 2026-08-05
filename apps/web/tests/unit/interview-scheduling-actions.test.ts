import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  cancelSchedulingRequest: vi.fn(),
  proposeHostSchedulingRequest: vi.fn(),
  resolveHostSchedulingRequest: vi.fn(),
  respondToSchedulingRequest: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: rateLimitMock,
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/notifications/dispatcher", () => ({
  triggerDispatch: vi.fn(),
}));

const {
  cancelSchedulingAction,
  proposeSchedulingAction,
  resolveSchedulingAction,
  respondToSchedulingAction,
} = await import("../../app/actions/scheduling");

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const OPTION_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "user_scheduler" });
  rateLimitMock.mockResolvedValue({ allowed: true });
});

describe("interview scheduling action boundary", () => {
  it("rejects malformed request identifiers before authentication or database work", async () => {
    await expect(
      respondToSchedulingAction("not-a-uuid", "selected", OPTION_ID),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.respondToSchedulingRequest).not.toHaveBeenCalled();
  });

  it("rejects an option on an alternative request before database work", async () => {
    await expect(
      respondToSchedulingAction(
        REQUEST_ID,
        "alternate_requested",
        OPTION_ID,
      ),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(dbMocks.respondToSchedulingRequest).not.toHaveBeenCalled();
  });

  it("rate-limits proposals before calling the service-role RPC", async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false });
    const startsAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    await expect(
      proposeSchedulingAction({
        applicationId: APPLICATION_ID,
        meetingType: "video",
        durationMinutes: 30,
        proposalTimezone: "UTC",
        meetingDetails: "Private video link",
        startsAt: [startsAt],
      }),
    ).resolves.toEqual({ ok: false, error: "rate_limited" });
    expect(dbMocks.proposeHostSchedulingRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["cancel", () => cancelSchedulingAction(REQUEST_ID)],
    ["resolve", () => resolveSchedulingAction(REQUEST_ID, "completed")],
  ] as const)("rate-limits %s before database work", async (kind, action) => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false });
    await expect(action()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(rateLimitMock).toHaveBeenCalledWith(
      `scheduling-${kind}:user_scheduler`,
      30,
      60 * 60 * 1000,
    );
    expect(dbMocks.cancelSchedulingRequest).not.toHaveBeenCalled();
    expect(dbMocks.resolveHostSchedulingRequest).not.toHaveBeenCalled();
  });
});
