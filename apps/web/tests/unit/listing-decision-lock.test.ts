import { describe, expect, it, vi } from "vitest";

import { withListingDecisionLock } from "../../lib/listingDecisionLock";

function kvResponse(result: unknown): Response {
  return {
    ok: true,
    json: async () => ({ result }),
  } as Response;
}

describe("listing decision lock", () => {
  it("serializes the same user/listing in non-production", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    let markFirstStarted: () => void = () => undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withListingDecisionLock(
      "user-1",
      "listing-1",
      async () => {
        events.push("first:start");
        markFirstStarted();
        await firstGate;
        events.push("first:end");
        return "first";
      },
      { environment: "test" },
    );
    await firstStarted;

    const second = withListingDecisionLock(
      "user-1",
      "listing-1",
      async () => {
        events.push("second:start");
        return "second";
      },
      { environment: "test" },
    );
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
    expect(firstResult).toEqual({ acquired: true, value: "first" });
    expect(secondResult).toEqual({ acquired: true, value: "second" });
  });

  it("fails closed in production when KV is not configured", async () => {
    const work = vi.fn(async () => "mutated");
    const result = await withListingDecisionLock("user-1", "listing-1", work, {
      environment: "production",
      kv: null,
    });

    expect(result).toEqual({ acquired: false, reason: "unavailable" });
    expect(work).not.toHaveBeenCalled();
  });

  it("uses SET NX PX and releases only its own token", async () => {
    const commands: unknown[][] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      commands.push(command);
      return kvResponse(commands.length === 1 ? "OK" : 1);
    }) as unknown as typeof fetch;

    const result = await withListingDecisionLock(
      "user-1",
      "listing-1",
      async () => "done",
      {
        environment: "production",
        kv: { url: "https://kv.invalid", token: "test-api-token" },
        fetchImpl,
        tokenFactory: () => "owner-token",
        maxAttempts: 1,
      },
    );

    expect(result).toEqual({ acquired: true, value: "done" });
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual([
      "SET",
      expect.stringContaining("lock:listing-decision:"),
      "owner-token",
      "NX",
      "PX",
      "30000",
    ]);
    expect(String(commands[0]?.[1])).not.toContain("user-1");
    expect(String(commands[0]?.[1])).not.toContain("listing-1");
    expect(commands[1]?.[0]).toBe("EVAL");
    expect(commands[1]?.[1]).toEqual(expect.stringContaining('redis.call("get"'));
    expect(commands[1]?.[1]).toEqual(expect.stringContaining('redis.call("del"'));
    expect(commands[1]?.slice(2)).toEqual([
      "1",
      commands[0]?.[1],
      "owner-token",
    ]);
  });

  it("does not enter the critical section when the production lock is contended", async () => {
    const fetchImpl = vi.fn(async () => kvResponse(null)) as unknown as typeof fetch;
    const sleep = vi.fn(async () => undefined);
    const work = vi.fn(async () => "mutated");

    const result = await withListingDecisionLock("user-1", "listing-1", work, {
      environment: "production",
      kv: { url: "https://kv.invalid", token: "test-api-token" },
      fetchImpl,
      tokenFactory: () => "owner-token",
      maxAttempts: 2,
      sleep,
    });

    expect(result).toEqual({ acquired: false, reason: "contended" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  it("fails closed when the production KV request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const work = vi.fn(async () => "mutated");

    const result = await withListingDecisionLock("user-1", "listing-1", work, {
      environment: "production",
      kv: { url: "https://kv.invalid", token: "test-api-token" },
      fetchImpl,
      maxAttempts: 1,
    });

    expect(result).toEqual({ acquired: false, reason: "unavailable" });
    expect(work).not.toHaveBeenCalled();
  });
});
