/**
 * Unit tests for withdrawApplication — the seeker's own-application withdraw
 * path, whose rules changed in fix/application-withdraw-restrictions
 * (widened to reviewing/saved_by_host, deliberately still excluding
 * `offered`, which has its own accept/decline path).
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockClient = { from: mockFrom };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
}));

import { withdrawApplication } from "../src/queries/seekerApplicationsRich.js";

/** Fluent chain stub resolving to `result` (see applicationStatus.test.ts). */
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  chain.select = self;
  chain.update = vi.fn(self);
  chain.insert = self;
  chain.eq = self;
  chain.maybeSingle = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

/** Queue chains in call order — each `.from()` consumes the next one. */
function queueFromResults(...chains: ReturnType<typeof makeChain>[]) {
  for (const chain of chains) mockFrom.mockReturnValueOnce(chain);
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };

beforeEach(() => {
  mockFrom.mockReset();
});

describe("withdrawApplication", () => {
  for (const status of ["applied", "reviewing", "saved_by_host"] as const) {
    it(`withdraws an application in '${status}' and stamps seeker_withdrew`, async () => {
      const appRead = makeChain({
        data: { id: "app-1", seeker_profile_id: "seeker-1", status },
      });
      // The UPDATE now chains .select("id").maybeSingle() — a matched row must
      // come back for the affected-row assertion.
      const update = makeChain({ data: { id: "app-1" }, error: null });
      queueFromResults(makeChain(SEEKER_PROFILE), appRead, update);

      const result = await withdrawApplication("token", "user_1", "app-1");

      expect(result).toEqual({ ok: true });
      expect(update.update).toHaveBeenCalledWith({
        status: "withdrawn",
        withdrawn_reason: "seeker_withdrew",
      });
    });
  }

  it("returns conflict when the UPDATE matches no row (race or RLS filter)", async () => {
    const appRead = makeChain({
      data: { id: "app-1", seeker_profile_id: "seeker-1", status: "applied" },
    });
    // Pre-checks passed, but the UPDATE's .select().maybeSingle() returns no
    // row — the withdraw must NOT be reported as a success.
    queueFromResults(makeChain(SEEKER_PROFILE), appRead, makeChain({ data: null }));

    const result = await withdrawApplication("token", "user_1", "app-1");

    expect(result).toEqual({ ok: false, error: "conflict" });
  });

  it("refuses to withdraw from 'offered' — the offer accept/decline path owns that state", async () => {
    const appRead = makeChain({
      data: { id: "app-1", seeker_profile_id: "seeker-1", status: "offered" },
    });
    queueFromResults(makeChain(SEEKER_PROFILE), appRead);

    const result = await withdrawApplication("token", "user_1", "app-1");

    expect(result).toEqual({ ok: false, error: "invalid_status" });
    // The guard fires before any update — only profile + app reads happened.
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  for (const status of ["withdrawn", "not_selected", "accepted"] as const) {
    it(`refuses to withdraw from terminal-ish status '${status}'`, async () => {
      const appRead = makeChain({
        data: { id: "app-1", seeker_profile_id: "seeker-1", status },
      });
      queueFromResults(makeChain(SEEKER_PROFILE), appRead);

      const result = await withdrawApplication("token", "user_1", "app-1");

      expect(result).toEqual({ ok: false, error: "invalid_status" });
    });
  }

  it("returns forbidden when the application belongs to a different seeker", async () => {
    const appRead = makeChain({
      data: { id: "app-1", seeker_profile_id: "someone-else", status: "applied" },
    });
    queueFromResults(makeChain(SEEKER_PROFILE), appRead);

    const result = await withdrawApplication("token", "user_1", "app-1");

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("returns not_found for an application id that doesn't exist", async () => {
    queueFromResults(makeChain(SEEKER_PROFILE), makeChain({ data: null }));

    const result = await withdrawApplication("token", "user_1", "missing");

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("returns profile_not_found when the user has no seeker profile", async () => {
    queueFromResults(makeChain({ data: null }));

    const result = await withdrawApplication("token", "user_1", "app-1");

    expect(result).toEqual({ ok: false, error: "profile_not_found" });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("surfaces the DB error message when the update fails", async () => {
    const appRead = makeChain({
      data: { id: "app-1", seeker_profile_id: "seeker-1", status: "applied" },
    });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      appRead,
      makeChain({ error: { message: "boom" } }),
    );

    const result = await withdrawApplication("token", "user_1", "app-1");

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});
