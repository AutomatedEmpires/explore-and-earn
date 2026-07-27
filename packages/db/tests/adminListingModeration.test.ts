/**
 * Operator listing actions must be able to act on a LIVE listing.
 *
 * The defect this pins: adminApproveListing / adminHoldListing /
 * adminCloseListing each filtered `.eq("status", "under_review")`. Since the
 * founder's 2026-07-26 decision hosts publish their own listings, so
 * `under_review` is a state a listing passes through in seconds and every
 * listing an operator would ever look at is `live`. All three therefore answered
 * "Listing is no longer awaiting review." and the only way to take a published
 * listing down was takeModerationAction's archive path.
 *
 * The fake below is a small row store rather than a call recorder: it applies
 * the status filter the way PostgREST would, so narrowing the permitted sources
 * back to `under_review` fails the LIVE cases instead of merely changing an
 * argument the assertions happen to quote.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface Row {
  id: string;
  status: string;
  closed_at?: string | null;
}

/** The one row every case operates on. */
let row: Row | null = null;
/** Forced database error, when a case is about failure handling. */
let forcedError: { message: string } | null = null;
/** Every update patch the code sent, in order. */
const patches: Record<string, unknown>[] = [];

function makeBuilder() {
  let patch: Record<string, unknown> = {};
  let idFilter: string | null = null;
  let statusFilter: readonly string[] | null = null;

  const builder: Record<string, unknown> = {
    update(next: Record<string, unknown>) {
      patch = next;
      patches.push(next);
      return builder;
    },
    eq(column: string, value: string) {
      if (column === "id") idFilter = value;
      if (column === "status") statusFilter = [value];
      return builder;
    },
    in(column: string, values: readonly string[]) {
      if (column === "status") statusFilter = values;
      return builder;
    },
    select() {
      return builder;
    },
    async maybeSingle() {
      if (forcedError) return { data: null, error: forcedError };
      if (!row) return { data: null, error: null };
      if (idFilter !== null && row.id !== idFilter) {
        return { data: null, error: null };
      }
      if (statusFilter !== null && !statusFilter.includes(row.status)) {
        return { data: null, error: null };
      }
      row = { ...row, ...(patch as Partial<Row>) };
      return { data: { id: row.id }, error: null };
    },
  };

  return builder;
}

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ from: () => makeBuilder() }),
}));

const { adminApproveListing, adminCloseListing, adminHoldListing } =
  await import("../src/queries/admin");
const { OPERATOR_LISTING_TRANSITIONS } = await import(
  "../src/lib/operatorListingTransitions"
);

const NO_MATCH = OPERATOR_LISTING_TRANSITIONS.close.noMatchMessage;

beforeEach(() => {
  row = null;
  forcedError = null;
  patches.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("operator moderation of a LIVE listing", () => {
  /**
   * The case the whole change exists for. A published listing is what an
   * operator actually has in front of them, and before this it could not be
   * taken down through the close action at all.
   */
  it("closes a LIVE listing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:34:56.000Z"));
    row = { id: "listing-live", status: "live" };

    await expect(
      adminCloseListing("service-key", "listing-live", "Misleading pay claim"),
    ).resolves.toEqual({ ok: true });

    expect(row).toMatchObject({
      status: "closed",
      closed_at: "2026-07-26T12:34:56.000Z",
    });
  });

  it("holds a LIVE listing back to draft", async () => {
    row = { id: "listing-live", status: "live" };

    await expect(
      adminHoldListing("service-key", "listing-live"),
    ).resolves.toEqual({ ok: true });

    expect(row).toMatchObject({ status: "draft" });
  });

  /** Already published: the action reports success rather than a false failure. */
  it("approving an already-live listing is idempotent", async () => {
    row = { id: "listing-live", status: "live" };

    await expect(
      adminApproveListing("service-key", "listing-live"),
    ).resolves.toEqual({ ok: true });

    expect(row).toMatchObject({ status: "live" });
  });
});

describe("operator moderation of an under-review listing", () => {
  it("approves an under-review listing", async () => {
    row = { id: "listing-1", status: "under_review" };

    await expect(
      adminApproveListing("service-key", "listing-1"),
    ).resolves.toEqual({ ok: true });

    expect(row).toMatchObject({ status: "live" });
    expect(patches).toEqual([{ status: "live" }]);
  });

  it("holds an under-review listing back to draft", async () => {
    row = { id: "listing-3", status: "under_review" };

    await expect(
      adminHoldListing("service-key", "listing-3"),
    ).resolves.toEqual({ ok: true });

    expect(row).toMatchObject({ status: "draft" });
  });

  it("closes an under-review listing", async () => {
    row = { id: "listing-2", status: "under_review" };

    await expect(
      adminCloseListing("service-key", "listing-2"),
    ).resolves.toEqual({ ok: true });

    expect(row).toMatchObject({ status: "closed" });
  });
});

describe("operator moderation refusals", () => {
  /**
   * The negative control: widening the sources must not turn these into a
   * blanket write. A draft is the host's private workspace and an archived
   * listing is terminal — neither is an operator action's business.
   */
  it.each(["draft", "paused", "archived", "closed"])(
    "changes nothing on a %s listing",
    async (status) => {
      row = { id: "listing-x", status };

      await expect(
        adminCloseListing("service-key", "listing-x"),
      ).resolves.toEqual({ ok: false, error: NO_MATCH });
      await expect(
        adminHoldListing("service-key", "listing-x"),
      ).resolves.toEqual({ ok: false, error: NO_MATCH });
      await expect(
        adminApproveListing("service-key", "listing-x"),
      ).resolves.toEqual({ ok: false, error: NO_MATCH });

      expect(row).toMatchObject({ status });
    },
  );

  /** The message has to be true: "awaiting review" was not. */
  it("says what the listing actually has to be, not 'awaiting review'", () => {
    for (const transition of Object.values(OPERATOR_LISTING_TRANSITIONS)) {
      expect(transition.noMatchMessage).not.toMatch(/awaiting review\.$/);
      expect(transition.noMatchMessage).toMatch(/live/i);
      expect([...transition.from].sort()).toEqual(["live", "under_review"]);
    }
  });

  it("reports no success when the listing does not exist", async () => {
    row = null;

    await expect(
      adminApproveListing("service-key", "missing"),
    ).resolves.toEqual({ ok: false, error: NO_MATCH });
  });

  it("returns the database error instead of swallowing it", async () => {
    forcedError = { message: "database unavailable" };

    await expect(
      adminApproveListing("service-key", "listing-1"),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
    await expect(
      adminHoldListing("service-key", "listing-1"),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
    await expect(
      adminCloseListing("service-key", "listing-1"),
    ).resolves.toEqual({ ok: false, error: "database unavailable" });
  });
});
