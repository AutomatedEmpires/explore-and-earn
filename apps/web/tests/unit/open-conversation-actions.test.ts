import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getOrCreateConversationForHost: vi.fn(),
  getOrCreateConversationForSeekerApplication: vi.fn(),
  markMessagesRead: vi.fn(),
  recordEvent: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimit: checkRateLimitMock,
  // Actions now call the distributed (async) limiter — same mock drives both.
  checkRateLimitDistributed: (...args: unknown[]) =>
    Promise.resolve(checkRateLimitMock(...args)),
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/notifications/dispatcher", () => ({
  triggerDispatch: vi.fn(),
}));

import {
  openHostApplicationConversationAction,
  openSeekerApplicationConversationAction,
} from "../../app/actions/messages";

const CONVERSATION = { id: "conv-1" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user-1",
    getToken: vi.fn().mockResolvedValue("token-1"),
  });
  checkRateLimitMock.mockReturnValue({ allowed: true });
});

describe("openSeekerApplicationConversationAction", () => {
  it("requires an authenticated Clerk session", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: vi.fn() });

    await expect(
      openSeekerApplicationConversationAction("app-1"),
    ).resolves.toEqual({ ok: false, error: "unauthenticated" });
    expect(dbMocks.getOrCreateConversationForSeekerApplication).not.toHaveBeenCalled();
  });

  it("rate limits before database work", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false });

    await expect(
      openSeekerApplicationConversationAction("app-1"),
    ).resolves.toEqual({ ok: false, error: "rate_limit_exceeded" });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "conversation-open:user-1",
      30,
      5 * 60 * 1000,
    );
    expect(dbMocks.getOrCreateConversationForSeekerApplication).not.toHaveBeenCalled();
  });

  it("opens the owned application thread and refreshes the list", async () => {
    dbMocks.getOrCreateConversationForSeekerApplication.mockResolvedValue(
      CONVERSATION,
    );

    await expect(
      openSeekerApplicationConversationAction("app-1"),
    ).resolves.toEqual({ ok: true, conversationId: "conv-1" });
    expect(dbMocks.getOrCreateConversationForSeekerApplication).toHaveBeenCalledWith(
      "token-1",
      "user-1",
      "app-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/messages");
  });

  it("returns unavailable without exposing foreign application state", async () => {
    dbMocks.getOrCreateConversationForSeekerApplication.mockResolvedValue(null);

    await expect(
      openSeekerApplicationConversationAction("foreign-app"),
    ).resolves.toEqual({ ok: false, error: "unavailable" });
  });

  it("tolerates the migration deployment window", async () => {
    dbMocks.getOrCreateConversationForSeekerApplication.mockRejectedValue(
      new Error("PGRST202 function not found"),
    );

    await expect(
      openSeekerApplicationConversationAction("app-1"),
    ).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });
});

describe("openHostApplicationConversationAction", () => {
  it("opens the exact applicant thread and refreshes the host list", async () => {
    dbMocks.getOrCreateConversationForHost.mockResolvedValue(CONVERSATION);

    await expect(
      openHostApplicationConversationAction("seeker-1", "app-1"),
    ).resolves.toEqual({ ok: true, conversationId: "conv-1" });
    expect(dbMocks.getOrCreateConversationForHost).toHaveBeenCalledWith(
      "token-1",
      "user-1",
      "seeker-1",
      "app-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/host/messages");
  });

  it("rejects missing relationship input before authentication or database work", async () => {
    await expect(
      openHostApplicationConversationAction("", "app-1"),
    ).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(authMock).not.toHaveBeenCalled();
    expect(dbMocks.getOrCreateConversationForHost).not.toHaveBeenCalled();
  });
});
