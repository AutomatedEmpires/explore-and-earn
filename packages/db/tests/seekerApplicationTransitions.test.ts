import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
vi.mock("../src/client.js", () => ({
  authedClient: () => ({ rpc: mockRpc }),
}));

import { transitionSeekerApplication } from "../src/queries/seekerApplicationTransitions.js";

beforeEach(() => {
  mockRpc.mockReset();
});

describe("transitionSeekerApplication", () => {
  it("passes the bounded intent to the migration-058 RPC", async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    const result = await transitionSeekerApplication(
      "token",
      "00000000-0000-0000-0000-000000000001",
      "decline_offer",
    );

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("seeker_transition_application", {
      p_application_id: "00000000-0000-0000-0000-000000000001",
      p_intent: "decline_offer",
    });
  });

  it("surfaces an explicit RPC business failure", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, error: "invalid_transition" },
      error: null,
    });

    await expect(
      transitionSeekerApplication("token", "app-1", "accept_offer"),
    ).resolves.toEqual({ ok: false, error: "invalid_transition" });
  });

  it("surfaces a PostgREST transport error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      transitionSeekerApplication("token", "app-1", "withdraw"),
    ).resolves.toEqual({ ok: false, error: "permission denied" });
  });

  for (const malformed of [null, [], {}, { ok: "yes" }]) {
    it(`fails closed for malformed RPC data: ${JSON.stringify(malformed)}`, async () => {
      mockRpc.mockResolvedValue({ data: malformed, error: null });

      await expect(
        transitionSeekerApplication("token", "app-1", "withdraw"),
      ).resolves.toEqual({ ok: false, error: "transition_failed" });
    });
  }
});

describe("migration 058 transition contract", () => {
  const sql = readFileSync(
    new URL(
      "../../../supabase/migrations/058_seeker_application_transitions.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("keeps seeker writes behind an authenticated SECURITY DEFINER RPC", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("public.current_seeker_profile_ids()");
    expect(sql).toContain("from public");
    expect(sql).toContain("to authenticated, service_role");
  });

  it("requires JWT-sub ownership for authenticated callers and bypasses only for service_role", () => {
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("auth.role() = 'service_role'");
    expect(sql).toContain("a.seeker_profile_id in");
    expect(sql).not.toContain("p_clerk_user_id");
  });

  it("locks rows, checks update cardinality, and stamps offer decisions", () => {
    expect(sql).toContain("p_intent is null");
    expect(sql).toContain("for update");
    expect(sql).toContain("get diagnostics v_updated_count = row_count");
    expect(sql).toContain("v_updated_count <> 1");
    expect(sql).toContain("v_decided_at := now()");
    expect(sql).toContain("'offer_declined'");
    expect(sql).toContain("'seeker_withdrew'");
  });

  it("rejects offer responses after the persisted expiry window", () => {
    expect(sql).toContain("a.expires_at");
    expect(sql).toContain("v_expires_at <= now()");
    expect(sql).toContain("'offer_expired'");
  });
});

describe("terminal application history contract", () => {
  const applicationSources = [
    "../src/queries/applications.ts",
    "../src/queries/listings.ts",
    "../src/queries/savedListings.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  it("never resurfaces a uniquely constrained withdrawn application as newly applicable", () => {
    for (const source of applicationSources) {
      expect(source).not.toContain('.neq("status", "withdrawn")');
    }
  });
});
