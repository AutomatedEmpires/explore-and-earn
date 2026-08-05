/**
 * Messaging thread-open authorization tests. Supabase is mocked here; connected
 * SQL assertions cover both identity-derived RPCs, grants, locks, and inserts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Result {
  data: unknown;
  error: null | { code?: string; message: string };
}

let cfg: {
  hostProfile: Result;
  seekerProfile: Result;
  conversationOwned: Result;
  seekerRpc: Result;
  hostRpc: Result;
  contextRpc: Result;
  sendRpc: Result;
};

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

vi.mock("../src/client", () => ({
  authedClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "send_my_conversation_message") {
        return Promise.resolve(cfg.sendRpc);
      }
      if (name === "ensure_my_host_application_conversation") {
        return Promise.resolve(cfg.hostRpc);
      }
      if (name === "get_my_conversation_contexts") {
        return Promise.resolve(cfg.contextRpc);
      }
      return Promise.resolve(cfg.seekerRpc);
    },
    from: (table: string) => {
      const settle = () => {
        if (table === "host_profiles") return Promise.resolve(cfg.hostProfile);
        if (table === "seeker_profiles") return Promise.resolve(cfg.seekerProfile);
        if (table === "conversations") {
          return Promise.resolve(cfg.conversationOwned);
        }
        return Promise.resolve({ data: null, error: null });
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: settle,
      };
      return builder;
    },
  }),
}));

const {
  canStartApplicationConversation,
  getConversationContexts,
  getOrCreateConversationForHost,
  getOrCreateConversationForSeekerApplication,
  sendMessage,
} = await import("../src/queries/messages");

const CONV_ROW = {
  id: "conv-1",
  seeker_profile_id: "seeker-1",
  host_profile_id: "host-1",
  listing_id: "listing-1",
  application_id: "app-1",
  last_message_at: null,
  created_at: "2026-06-30T00:00:00.000Z",
};

const none: Result = { data: null, error: null };

function baseConfig(): typeof cfg {
  return {
    hostProfile: none,
    seekerProfile: none,
    conversationOwned: { data: CONV_ROW, error: null },
    seekerRpc: { data: "conv-1", error: null },
    hostRpc: { data: "conv-1", error: null },
    contextRpc: { data: [], error: null },
    sendRpc: {
      data: [
        {
          message_id: "message-1",
          sender_role: "host",
          sender_profile_id: "host-1",
          created_at: "2026-08-05T15:00:00.000Z",
        },
      ],
      error: null,
    },
  };
}

afterEach(() => {
  rpcCalls.length = 0;
});

describe("application conversation lifecycle gate", () => {
  it.each([
    "applied",
    "reviewing",
    "saved_by_host",
    "offered",
    "accepted",
    "active",
    "completed",
  ])("allows a new thread for %s", (status) => {
    expect(canStartApplicationConversation(status)).toBe(true);
  });

  it.each(["not_selected", "withdrawn", "expired"])(
    "blocks a new thread for %s",
    (status) => {
      expect(canStartApplicationConversation(status)).toBe(false);
    },
  );
});

describe("getOrCreateConversationForSeekerApplication", () => {
  it("passes only the application id to the seeker identity RPC", async () => {
    cfg = baseConfig();
    cfg.seekerProfile = { data: { id: "seeker-1" }, error: null };

    const result = await getOrCreateConversationForSeekerApplication(
      "tok",
      "seeker-clerk",
      "app-1",
    );

    expect(result?.id).toBe("conv-1");
    expect(rpcCalls).toEqual([
      {
        name: "ensure_my_application_conversation",
        args: { p_application_id: "app-1" },
      },
    ]);
  });

  it("returns null without leaking a foreign or terminal application", async () => {
    cfg = baseConfig();
    cfg.seekerRpc = none;

    const result = await getOrCreateConversationForSeekerApplication(
      "tok",
      "seeker-clerk",
      "foreign-app",
    );

    expect(result).toBeNull();
  });

  it("rejects an RPC row that fails the seeker ownership guard", async () => {
    cfg = baseConfig();
    cfg.seekerProfile = { data: { id: "different-seeker" }, error: null };

    const result = await getOrCreateConversationForSeekerApplication(
      "tok",
      "seeker-clerk",
      "app-1",
    );

    expect(result).toBeNull();
  });
});

describe("getOrCreateConversationForHost", () => {
  it("passes only the application id to the host identity RPC", async () => {
    cfg = baseConfig();
    cfg.hostProfile = { data: { id: "host-1" }, error: null };

    const result = await getOrCreateConversationForHost(
      "tok",
      "host-clerk",
      "seeker-1",
      "app-1",
    );

    expect(result?.id).toBe("conv-1");
    expect(rpcCalls).toEqual([
      {
        name: "ensure_my_host_application_conversation",
        args: { p_application_id: "app-1" },
      },
    ]);
  });

  it("returns null when the owned application cannot open a thread", async () => {
    cfg = baseConfig();
    cfg.hostRpc = none;

    const result = await getOrCreateConversationForHost(
      "tok",
      "host-clerk",
      "seeker-1",
      "app-1",
    );

    expect(result).toBeNull();
  });

  it("rejects a derived row that does not match the expected applicant", async () => {
    cfg = baseConfig();
    cfg.hostProfile = { data: { id: "host-1" }, error: null };

    const result = await getOrCreateConversationForHost(
      "tok",
      "host-clerk",
      "different-seeker",
      "app-1",
    );

    expect(result).toBeNull();
  });
});

describe("getConversationContexts", () => {
  it("requests only unique owned ids and rejects unexpected RPC rows", async () => {
    cfg = baseConfig();
    cfg.contextRpc = {
      data: [
        {
          conversation_id: "conv-1",
          listing_id: "listing-1",
          listing_title: "Closed orchard role",
          listing_category: "farm",
          host_name: "Orchard Host",
        },
        {
          conversation_id: "unrequested-conversation",
          listing_id: "hidden-listing",
          listing_title: "Must not escape",
          listing_category: "remote",
          host_name: "Other Host",
        },
      ],
      error: null,
    };

    const result = await getConversationContexts("tok", ["conv-1", "conv-1"]);

    expect(rpcCalls).toEqual([
      {
        name: "get_my_conversation_contexts",
        args: { p_conversation_ids: ["conv-1"] },
      },
    ]);
    expect(result.available).toBe(true);
    expect([...result.contexts.values()]).toEqual([
      {
        conversationId: "conv-1",
        listingId: "listing-1",
        listingTitle: "Closed orchard role",
        listingCategory: "farm",
        hostName: "Orchard Host",
      },
    ]);
  });

  it("fails closed to the mixed category for malformed database data", async () => {
    cfg = baseConfig();
    cfg.contextRpc = {
      data: [
        {
          conversation_id: "conv-1",
          listing_id: "listing-1",
          listing_title: "Legacy role",
          listing_category: "not-a-category",
          host_name: "Host",
        },
      ],
      error: null,
    };

    const result = await getConversationContexts("tok", ["conv-1"]);

    expect(result.contexts.get("conv-1")?.listingCategory).toBe("mix");
  });

  it("degrades without breaking inboxes while migration 075 is pending", async () => {
    cfg = baseConfig();
    cfg.contextRpc = {
      data: null,
      error: { code: "PGRST202", message: "schema cache miss" },
    };

    const result = await getConversationContexts("tok", ["conv-1"]);

    expect(result.available).toBe(false);
    expect(result.contexts.size).toBe(0);
  });
});

describe("sendMessage", () => {
  it("uses only the JWT-derived atomic RPC and returns its durable row", async () => {
    cfg = baseConfig();

    await expect(sendMessage("tok", "conv-1", "  Hello there  ")).resolves.toEqual({
      ok: true,
      senderRole: "host",
      messageId: "message-1",
      createdAt: "2026-08-05T15:00:00.000Z",
    });
    expect(rpcCalls).toEqual([
      {
        name: "send_my_conversation_message",
        args: { p_conversation_id: "conv-1", p_body: "Hello there" },
      },
    ]);
  });

  it("fails closed and retryably when code reaches the database before migration 090", async () => {
    cfg = baseConfig();
    cfg.sendRpc = {
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.send_my_conversation_message",
      },
    };

    await expect(sendMessage("tok", "conv-1", "Hello")).resolves.toEqual({
      ok: false,
      error: "migration_pending",
    });
    expect(rpcCalls).toHaveLength(1);
  });

  it("preserves the empty and 4,000-character body boundary before database work", async () => {
    cfg = baseConfig();

    await expect(sendMessage("tok", "conv-1", "   ")).resolves.toEqual({
      ok: false,
      error: "empty",
    });
    await expect(sendMessage("tok", "conv-1", "x".repeat(4001))).resolves.toEqual({
      ok: false,
      error: "too_long",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("does not disclose a missing or foreign conversation", async () => {
    cfg = baseConfig();
    cfg.sendRpc = { data: [], error: null };

    await expect(sendMessage("tok", "foreign-conv", "Hello")).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
