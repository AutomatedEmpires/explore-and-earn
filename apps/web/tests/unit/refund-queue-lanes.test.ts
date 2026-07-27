/**
 * The admin refund queue's lanes and status words.
 *
 * The defect this pins: 'approved' — a persisted state in which Stripe may
 * already have paid out — had no lane, no metric, and no label of its own. A
 * claimed row that never recorded its outcome could only be found by scrolling
 * the unfiltered queue, and it rendered as "Approved", which reads as a
 * finished, successful refund.
 *
 * The lane list is asserted against the statuses migration 047 declares, read
 * off the migration itself, so adding a status without a lane fails here rather
 * than becoming another row nobody can filter to.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  REFUND_LANES,
  isActionableRefund,
  isUnresolvedRefund,
  refundStatusLabel,
} from "../../components/admin/refundQueueLanes";

/** The statuses the refund_requests CHECK actually allows, read off disk. */
function migrationRefundStatuses(): string[] {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const dir = join(here, "..", "..", "..", "..", "supabase", "migrations");
  const file = readdirSync(dir).find((name) => name.includes("refund_requests"));
  expect(file).toBeTruthy();
  const sql = readFileSync(join(dir, file as string), "utf8");

  const match = sql.match(
    /check\s*\(\s*status\s+in\s*\(([^)]*)\)/i,
  );
  expect(match).toBeTruthy();
  return [...(match as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map(
    (m) => m[1],
  );
}

describe("refund queue lanes", () => {
  it("gives every status 047 declares a lane to be found in", () => {
    const statuses = migrationRefundStatuses();

    // Sanity: the reader found the real CHECK, so an empty list cannot pass.
    expect(statuses).toContain("approved");
    expect(statuses.length).toBeGreaterThan(3);

    const laneKeys = REFUND_LANES.map((lane) => lane.key);
    for (const status of statuses) {
      expect(laneKeys).toContain(status);
    }
    expect(laneKeys[0]).toBe("all");
  });

  it("labels the claimed lane as in flight, never as done", () => {
    const lane = REFUND_LANES.find((l) => l.key === "approved");
    expect(lane?.label).toBe("Processing");
    expect(lane?.label).not.toMatch(/approved/i);
  });
});

describe("refundStatusLabel", () => {
  it("never renders 'approved' as a finished refund", () => {
    const label = refundStatusLabel("approved");
    expect(label).toBe("Processing");
    expect(label).not.toMatch(/approved/i);
    expect(label).not.toMatch(/refunded/i);
  });

  it("keeps the terminal words unambiguous", () => {
    expect(refundStatusLabel("refunded")).toBe("Refunded");
    expect(refundStatusLabel("denied")).toBe("Denied");
    expect(refundStatusLabel("failed")).toBe("Failed");
    expect(refundStatusLabel("requested")).toBe("Awaiting review");
  });
});

describe("the two open-ness questions", () => {
  /**
   * A claimed row still needs a human, but offering Approve/Deny on it would
   * offer a second payout. Collapsing these two into one predicate is how the
   * card ended up either dimming an unresolved row as "done" or drawing a
   * button that could double-spend.
   */
  it("treats a claimed row as unresolved but not as actionable", () => {
    expect(isUnresolvedRefund("approved")).toBe(true);
    expect(isActionableRefund("approved")).toBe(false);

    expect(isUnresolvedRefund("requested")).toBe(true);
    expect(isActionableRefund("requested")).toBe(true);
  });

  it.each(["refunded", "denied", "failed"])("treats %s as finished", (status) => {
    expect(isUnresolvedRefund(status)).toBe(false);
    expect(isActionableRefund(status)).toBe(false);
  });
});
