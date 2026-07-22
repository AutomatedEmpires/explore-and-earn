import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => ({
  fromCalls: [] as string[],
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    from: () => {
      throw new Error("admin client is not expected in listing coordinate tests");
    },
  }),
}));

vi.mock("../src/client", () => ({
  anonClient: () => ({
    from: () => {
      throw new Error("anonymous client is not expected in listing coordinate tests");
    },
  }),
  authedClient: () => ({
    from: (table: string) => {
      database.fromCalls.push(table);
      if (table === "host_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "host-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "listings") {
        return {
          insert: (payload: Record<string, unknown>) => {
            database.inserts.push(payload);
            return {
              select: () => ({
                single: async () => ({ data: { id: "listing-1" }, error: null }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            database.updates.push(payload);
            const chain = {
              eq: () => chain,
              select: () => chain,
              maybeSingle: async () => ({ data: { id: "listing-1" }, error: null }),
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

import { createListing, updateListing } from "../src/queries/listings";

beforeEach(() => {
  database.fromCalls.length = 0;
  database.inserts.length = 0;
  database.updates.length = 0;
});

describe("listing coordinate writes", () => {
  it("persists a validated point on create", async () => {
    const result = await createListing("token", "user-1", {
      title: "Orchard harvest",
      category: "farm",
      locationName: "Wenatchee, Washington, United States",
      latitude: 47.4235,
      longitude: -120.3103,
    });

    expect(result).toEqual({ ok: true, listingId: "listing-1" });
    expect(database.inserts[0]).toMatchObject({
      location_display: "Wenatchee, Washington, United States",
      latitude: 47.4235,
      longitude: -120.3103,
    });
  });

  it("clears both coordinates atomically on update", async () => {
    const result = await updateListing("token", "user-1", "listing-1", {
      locationName: "Wenatchee, WA",
      latitude: null,
      longitude: null,
    });

    expect(result).toEqual({ ok: true });
    expect(database.updates[0]).toMatchObject({
      location_display: "Wenatchee, WA",
      latitude: null,
      longitude: null,
    });
  });

  it("clears a stale point when a legacy caller changes only the label", async () => {
    await updateListing("token", "user-1", "listing-1", {
      locationName: "Yakima, WA",
    });
    expect(database.updates[0]).toMatchObject({
      location_display: "Yakima, WA",
      latitude: null,
      longitude: null,
    });
  });

  it("rejects a partial pair before any database query", async () => {
    const result = await updateListing("token", "user-1", "listing-1", {
      locationName: "Wenatchee, WA",
      latitude: 47.4235,
    });
    expect(result).toMatchObject({ ok: false });
    expect(database.fromCalls).toEqual([]);
  });

  it("rejects an out-of-bounds point before any database query", async () => {
    const result = await createListing("token", "user-1", {
      title: "Impossible pin",
      category: "farm",
      locationName: "Impossible place",
      latitude: 91,
      longitude: 0,
    });
    expect(result).toMatchObject({ ok: false });
    expect(database.fromCalls).toEqual([]);
  });
});

describe("listing compensation writes", () => {
  it("clears both bounds and marks pay not stated", async () => {
    const result = await updateListing("token", "user-1", "listing-1", {
      payMin: null,
      payMax: null,
    });

    expect(result).toEqual({ ok: true });
    expect(database.updates[0]).toMatchObject({
      compensation_min_cents: null,
      compensation_max_cents: null,
      pay_evidence: "not_stated",
    });
  });

  it("clears one bound while keeping stated pay evidence", async () => {
    const result = await updateListing("token", "user-1", "listing-1", {
      payMin: 18,
      payMax: null,
    });

    expect(result).toEqual({ ok: true });
    expect(database.updates[0]).toMatchObject({
      compensation_min_cents: 1_800,
      compensation_max_cents: null,
      pay_evidence: "confirmed",
    });
  });
});
