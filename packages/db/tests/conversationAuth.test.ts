/**
 * Unit tests for getOrCreateConversationForHost in
 * packages/db/src/queries/messages.ts — the host-initiated thread opener wired
 * in Phase 1 so messaging is reachable end-to-end.
 *
 * Focus: the authorization gate. The host UI passes seekerProfileId from a query
 * string, so the function must (a) resolve the caller's host profile and (b)
 * verify the seeker actually applied to one of THIS host's listings before
 * creating a thread — otherwise a host could forge an id to message any seeker
 * (the IDOR the security review flagged). The Supabase client is mocked; no DB.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Result {
  data: unknown;
  error: unknown;
}

let cfg: {
  hostProfile: Result;
  applicationRel: Result;
  conversationFind: Result;
  conversationInsert: Result;
};
const insertedConversations: Array<Record<string, unknown>> = [];

vi.mock("../src/client", () => ({
  authedClient: () => ({
    from: (table: string) => {
      let isInsert = false;
      const settle = () => {
        if (table === "host_profiles") return Promise.resolve(cfg.hostProfile);
        if (table === "applications") return Promise.resolve(cfg.applicationRel);
        if (table === "conversations") {
          return Promise.resolve(
            isInsert ? cfg.conversationInsert : cfg.conversationFind,
          );
        }
        return Promise.resolve({ data: null, error: null });
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (obj: Record<string, unknown>) => {
          isInsert = true;
          if (table === "conversations") insertedConversations.push(obj);
          return builder;
        },
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        limit: () => settle(),
        maybeSingle: () => settle(),
        single: () => settle(),
      };
      return builder;
    },
  }),
}));

const { getOrCreateConversationForHost } = await import("../src/queries/messages");

const CONV_ROW = {
  id: "conv-1",
  seeker_profile_id: "seeker-1",
  host_profile_id: "host-1",
  listing_id: null,
  application_id: null,
  last_message_at: null,
  created_at: "2026-06-30T00:00:00.000Z",
};

const ok = { data: null, error: null };

afterEach(() => {
  insertedConversations.length = 0;
});

describe("getOrCreateConversationForHost — authorization", () => {
  it("returns null when the caller has no host profile", async () => {
    cfg = {
      hostProfile: { data: null, error: null },
      applicationRel: { data: [], error: null },
      conversationFind: ok,
      conversationInsert: ok,
    };
    const result = await getOrCreateConversationForHost("tok", "host-clerk", "seeker-1");
    expect(result).toBeNull();
    expect(insertedConversations).toHaveLength(0);
  });

  it("returns null (IDOR guard) when the seeker never applied to this host's listings", async () => {
    cfg = {
      hostProfile: { data: { id: "host-1" }, error: null },
      applicationRel: { data: [], error: null }, // no application relationship
      conversationFind: ok,
      conversationInsert: ok,
    };
    // A forged/arbitrary seekerProfileId must NOT open a thread.
    const result = await getOrCreateConversationForHost("tok", "host-clerk", "stranger-seeker");
    expect(result).toBeNull();
    expect(insertedConversations).toHaveLength(0);
  });

  it("returns the existing thread without inserting when one already exists", async () => {
    cfg = {
      hostProfile: { data: { id: "host-1" }, error: null },
      applicationRel: { data: [{ id: "app-1" }], error: null },
      conversationFind: { data: [CONV_ROW], error: null },
      conversationInsert: ok,
    };
    const result = await getOrCreateConversationForHost("tok", "host-clerk", "seeker-1");
    expect(result?.id).toBe("conv-1");
    expect(insertedConversations).toHaveLength(0);
  });

  it("creates the thread when the relationship exists and none is open yet", async () => {
    cfg = {
      hostProfile: { data: { id: "host-1" }, error: null },
      applicationRel: { data: [{ id: "app-1" }], error: null },
      conversationFind: { data: [], error: null },
      conversationInsert: { data: CONV_ROW, error: null },
    };
    const result = await getOrCreateConversationForHost("tok", "host-clerk", "seeker-1");
    expect(result?.id).toBe("conv-1");
    expect(insertedConversations).toHaveLength(1);
    expect(insertedConversations[0].seeker_profile_id).toBe("seeker-1");
    expect(insertedConversations[0].host_profile_id).toBe("host-1");
  });
});
