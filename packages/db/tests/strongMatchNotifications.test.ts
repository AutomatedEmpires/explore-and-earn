/**
 * Unit tests for insertStrongMatchNotifications' dedupe (packages/db/src/queries/
 * notifications.ts). A new listing can strongly match a seeker who was already
 * alerted (e.g. a re-published listing); the per-(listing, seeker) dedupe_key must
 * prevent a second notification. The service-role client is mocked so no DB/env
 * is needed. Mirrors the mock in announcementIdempotency.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let existingDedupeKeys: string[] = [];
const insertedRows: Array<Record<string, unknown>> = [];

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: existingDedupeKeys.map((key) => ({ dedupe_key: key })),
            error: null,
          }),
      }),
      insert: (rows: Array<Record<string, unknown>>) => {
        insertedRows.push(...rows);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const { insertStrongMatchNotifications } = await import("../src/queries/notifications");

afterEach(() => {
  existingDedupeKeys = [];
  insertedRows.length = 0;
});

describe("insertStrongMatchNotifications — dedupe", () => {
  it("inserts one notification per fresh recipient with the expected shape", async () => {
    const result = await insertStrongMatchNotifications({
      listingId: "L1",
      listingTitle: "Orchard season",
      recipientClerkUserIds: ["user_a", "user_b"],
    });
    expect(result.inserted).toBe(2);
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]!.dedupe_key).toBe("strong_match:L1:user_a");
    expect(insertedRows[0]!.category).toBe("system");
    expect(insertedRows[0]!.subject_id).toBe("L1");
    expect(insertedRows[0]!.action_url).toBe("/listing/L1");
  });

  it("skips recipients already alerted for this listing", async () => {
    existingDedupeKeys = ["strong_match:L1:user_a"];
    const result = await insertStrongMatchNotifications({
      listingId: "L1",
      listingTitle: "Orchard season",
      recipientClerkUserIds: ["user_a", "user_b"],
    });
    expect(result.inserted).toBe(1);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]!.dedupe_key).toBe("strong_match:L1:user_b");
  });

  it("de-duplicates repeated/blank recipient ids and no-ops on empty", async () => {
    const deduped = await insertStrongMatchNotifications({
      listingId: "L1",
      listingTitle: "",
      recipientClerkUserIds: ["user_a", "user_a", ""],
    });
    expect(deduped.inserted).toBe(1);

    insertedRows.length = 0;
    const empty = await insertStrongMatchNotifications({
      listingId: "L1",
      listingTitle: "",
      recipientClerkUserIds: [],
    });
    expect(empty.inserted).toBe(0);
    expect(insertedRows).toHaveLength(0);
  });
});
