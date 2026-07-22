import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getConversationContexts: vi.fn(),
  getLastMessagesForConversations: vi.fn(),
  reportMessage: vi.fn(),
}));

vi.mock("@explore-and-earn/db", () => ({
  getConversationContexts: mocks.getConversationContexts,
  getLastMessagesForConversations: mocks.getLastMessagesForConversations,
}));

vi.mock("../../lib/sentry", () => ({
  reportMessage: mocks.reportMessage,
}));

import { loadMessageListData } from "../../lib/messageListData";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConversationContexts.mockResolvedValue({
    contexts: new Map([["conversation-id", { listingTitle: "Orchard role" }]]),
    available: true,
  });
  mocks.getLastMessagesForConversations.mockResolvedValue(
    new Map([["conversation-id", { body: "Hello" }]]),
  );
});

describe("loadMessageListData", () => {
  it("batch-loads participant context and last messages", async () => {
    const result = await loadMessageListData({
      token: "clerk-token",
      userId: "clerk-user-id",
      route: "/messages",
      conversationIds: ["conversation-id"],
    });

    expect(result.contexts.get("conversation-id")).toEqual({
      listingTitle: "Orchard role",
    });
    expect(result.lastMessages.get("conversation-id")).toEqual({
      body: "Hello",
    });
    expect(mocks.reportMessage).not.toHaveBeenCalled();
  });

  it("reports the rollout fallback once without blocking safe labels", async () => {
    mocks.getConversationContexts.mockResolvedValueOnce({
      contexts: new Map(),
      available: false,
    });

    await expect(
      loadMessageListData({
        token: "clerk-token",
        userId: "clerk-user-id",
        route: "/host/messages",
        conversationIds: ["conversation-id"],
      }),
    ).resolves.toMatchObject({ contexts: new Map() });

    expect(mocks.reportMessage).toHaveBeenCalledOnce();
    expect(mocks.reportMessage).toHaveBeenCalledWith(
      "conversation_context_rpc_unavailable",
      "warning",
      { route: "/host/messages", userId: "clerk-user-id" },
    );
  });
});
