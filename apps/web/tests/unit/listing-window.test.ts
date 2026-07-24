import { describe, expect, it } from "vitest";

import { formatListingWindow } from "../../lib/listingWindow";

/**
 * The listing detail page's opportunity window (UX review 2026-07-23).
 *
 * The defect this pins: the page rendered "Ongoing" whenever it could not build
 * a full date range. begins_at is nullable, the host form invites hosts to
 * leave timing open, and the publication gate ignores dates entirely — so on
 * every listing with no dates the hero chip asserted the role has no end date,
 * manufactured from a blank column. Worse, the old ternary fell through on
 * beginsAt alone: a host who stated ONLY an end date got a page announcing
 * "Ongoing", contradicting the end date they had just given us.
 *
 * "Ongoing" was also the only occurrence of that word in the codebase — every
 * other surface routes through formatOpportunityWindow, which says "Open" — so
 * the feed card and the detail page disagreed about the same listing.
 */

/**
 * Mid-month instants deliberately: begins_at/ends_at are timestamptz, and
 * formatMonthYear renders in the viewer's zone, so a UTC-midnight first-of-month
 * value lands in the previous month west of UTC. That is a real (separate,
 * cross-cutting) concern about how the whole app formats dates — it is not what
 * this module owns, and pinning it here would make these tests assert a bug.
 */
const MID_JUNE = "2026-06-15T12:00:00Z";
const MID_SEPT = "2026-09-15T12:00:00Z";

describe("formatListingWindow", () => {
  it("renders a full range when both dates are stated", () => {
    expect(formatListingWindow({ beginsAt: MID_JUNE, endsAt: MID_SEPT })).toBe(
      "Jun 2026 – Sep 2026",
    );
  });

  it("renders a start when only the start is stated", () => {
    expect(formatListingWindow({ beginsAt: MID_JUNE, endsAt: null })).toBe(
      "Starting Jun 2026",
    );
  });

  /** The branch that did not exist: this listing used to announce "Ongoing". */
  it("renders an end when only the end is stated — never contradicts the host", () => {
    const label = formatListingWindow({ beginsAt: null, endsAt: MID_SEPT });
    expect(label).toBe("Until Sep 2026");
    expect(label).not.toMatch(/ongoing/i);
  });

  it("says NOTHING when no dates are stated, rather than claiming continuity", () => {
    expect(formatListingWindow({ beginsAt: null, endsAt: null })).toBeNull();
    expect(formatListingWindow({})).toBeNull();
  });

  /**
   * The negative control, stated exhaustively: no input may produce the
   * affirmative word this fix removed.
   */
  it("NEVER emits 'Ongoing' for any combination of dates", () => {
    const dates = [null, undefined, MID_JUNE] as const;
    for (const beginsAt of dates) {
      for (const endsAt of dates) {
        const label = formatListingWindow({ beginsAt, endsAt });
        if (label !== null) expect(label).not.toMatch(/ongoing/i);
      }
    }
  });
});
