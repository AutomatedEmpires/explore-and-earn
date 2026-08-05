import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
  getOrCreateConversationForHost: vi.fn(),
  getOrCreateConversationForSeekerApplication: vi.fn(),
  markMessagesRead: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/server", () => ({ after: afterMock }));
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
  sendMessageAction,
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

  it("keeps a durable conversation successful when revalidation fails", async () => {
    dbMocks.getOrCreateConversationForSeekerApplication.mockResolvedValue(
      CONVERSATION,
    );
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    await expect(
      openSeekerApplicationConversationAction("app-1"),
    ).resolves.toEqual({ ok: true, conversationId: "conv-1" });
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action:
          "openSeekerApplicationConversationAction.postPersistRevalidate",
      }),
    );
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

describe("sendMessageAction", () => {
  it("returns a bounded unauthenticated failure before database work", async () => {
    authMock.mockResolvedValue({ userId: null, getToken: vi.fn() });

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
      retryable: false,
    });
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("rate limits before database work and preserves a retry path", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false });

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: false,
      error: "rate_limit_exceeded",
      retryable: true,
    });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "msg:user-1",
      30,
      60 * 1000,
    );
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
  });

  it.each(["empty", "too_long"])(
    "maps %s to a non-retryable validation failure",
    async (error) => {
      dbMocks.sendMessage.mockResolvedValue({ ok: false, error });

      await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
        ok: false,
        error: "invalid_message",
        retryable: false,
      });
    },
  );

  it("does not disclose a conversation the caller cannot access", async () => {
    dbMocks.sendMessage.mockResolvedValue({ ok: false, error: "not_found" });

    await expect(sendMessageAction("foreign-conv", "Hello")).resolves.toEqual({
      ok: false,
      error: "conversation_unavailable",
      retryable: false,
    });
  });

  it("treats an unknown insert response as delivery-ambiguous", async () => {
    dbMocks.sendMessage.mockResolvedValue({
      ok: false,
      error: "connection reset",
    });

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: false,
      error: "delivery_unconfirmed",
      retryable: true,
    });
  });

  it("fails retryably while the atomic delivery migration is pending", async () => {
    dbMocks.sendMessage.mockResolvedValue({
      ok: false,
      error: "migration_pending",
    });

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: false,
      error: "delivery_unconfirmed",
      retryable: true,
    });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns success after the atomic message/event transaction and schedules dispatch", async () => {
    dbMocks.sendMessage.mockResolvedValue({
      ok: true,
      senderRole: "host",
      messageId: "message-1",
      createdAt: "2026-08-05T15:00:00.000Z",
    });

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: true,
    });
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      "token-1",
      "conv-1",
      "Hello",
    );
    expect(afterMock).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith("/messages/conv-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/host/messages/conv-1");
  });

  it("never converts post-persist dispatch or refresh failures into duplicate-prone retries", async () => {
    dbMocks.sendMessage.mockResolvedValue({ ok: true, senderRole: "seeker" });
    afterMock.mockImplementation(() => {
      throw new Error("dispatcher unavailable");
    });
    revalidatePathMock.mockImplementation(() => {
      throw new Error("cache unavailable");
    });

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: true,
    });
    expect(reportErrorMock).toHaveBeenCalledTimes(2);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "sendMessageAction.postPersistDispatch",
      }),
    );
  });

  it("bounds thrown pre-persist failures as delivery-unconfirmed", async () => {
    authMock.mockRejectedValue(new Error("auth transport unavailable"));

    await expect(sendMessageAction("conv-1", "Hello")).resolves.toEqual({
      ok: false,
      error: "delivery_unconfirmed",
      retryable: true,
    });
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });
});
