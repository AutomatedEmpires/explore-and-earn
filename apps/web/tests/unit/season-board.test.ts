import { describe, expect, it } from "vitest";

import type { ApplicationWithListing } from "@explore-and-earn/db";
import {
  buildSeasonLine,
  buildWeekQueue,
  composeLede,
  movementLine,
  relativeRecency,
  type SeasonBoard,
} from "../../components/seeker/seasonBoard";
import type { SeekerStatusSummary } from "../../components/seeker/models";

/**
 * The season board's honesty contract, pinned:
 *   - no date → no clause, no queue row, no timeline mark;
 *   - "Host viewed" only from viewed_at;
 *   - deadline order beats category order everywhere.
 */

const NOW = new Date("2026-07-29T12:00:00Z");

const STATUS: SeekerStatusSummary = {
  seekerName: "Maya Castillo",
  resumeCompletion: 85,
  savedCount: 7,
  appliedCount: 3,
  offersCount: 1,
  acceptedCount: 0,
  unreadNotifications: 0,
  invitesCount: 1,
};

function listing(
  title: string,
  host: string,
  extra: Partial<NonNullable<ApplicationWithListing["listing"]>> = {},
): NonNullable<ApplicationWithListing["listing"]> {
  return {
    id: `listing-${title}`,
    title,
    category: "seasonal",
    location: "Coeur d'Alene, Idaho",
    opportunityWindow: "Winter season",
    status: "live",
    host: { name: host, verified: true },
    benefits: {
      housing: { provision: "provided" },
      meals: { provision: "provided" },
      pay: { provision: "provided", summary: "$21–25/hr" },
    },
    ...extra,
  };
}

function application(
  status: string,
  overrides: Partial<ApplicationWithListing> = {},
): ApplicationWithListing {
  return {
    id: `app-${status}-${overrides.listingId ?? "x"}`,
    listingId: "listing-x",
    status,
    submittedAt: "2026-07-23T09:00:00Z",
    expiresAt: null,
    reviewedAt: null,
    listing: listing("Lakeside Guest Experience Lead", "North Ridge Lodge"),
    ...overrides,
  };
}

function board(overrides: Partial<SeasonBoard> = {}): SeasonBoard {
  return {
    status: STATUS,
    offers: [],
    inMotion: [],
    closedRecent: [],
    accepted: [],
    invites: [],
    watching: [],
    threads: [],
    matches: [],
    ...overrides,
  };
}

/* ── the lede ────────────────────────────────────────────────────────────── */

describe("composeLede", () => {
  it("names every dated item, earliest deadline first, capped at three", () => {
    const lede = composeLede(
      board({
        offers: [application("offered", { expiresAt: "2026-08-03T12:00:00Z" })],
        watching: [
          {
            listing: listing("Whitewater Guide", "Cascade Rapids Co."),
            closesAt: "2026-08-01T12:00:00Z",
          },
        ],
        threads: [
          { id: "t1", withName: "North Ridge Lodge", lastMessageAt: "2026-07-29T10:00:00Z" },
        ],
      }),
      NOW,
    );

    expect(lede.clauseCount).toBe(3);
    expect(lede.sentence).toContain("Three things need you this week");
    // The thread reply (today) precedes Saturday's close, which precedes
    // Monday's offer expiry — time order, not category order.
    const replyAt = lede.sentence.indexOf("wrote back");
    const closesAt = lede.sentence.indexOf("closes applications");
    const offerAt = lede.sentence.indexOf("offer for");
    expect(replyAt).toBeGreaterThan(-1);
    expect(closesAt).toBeGreaterThan(replyAt);
    expect(offerAt).toBeGreaterThan(closesAt);
  });

  it("refuses to fabricate a deadline, but never hides an offer", () => {
    // No expiry and no readable listing: the sentence claims exactly what the
    // row proves — an offer exists — and nothing more.
    const lede = composeLede(
      board({ offers: [application("offered", { expiresAt: null, listing: null })] }),
      NOW,
    );
    expect(lede.sentence).toBe(
      "An offer is on the table — review it before anything else.",
    );
    expect(lede.sentence).not.toMatch(/expires|Monday|day/);
  });

  it("speaks in the singular for a single clause", () => {
    const lede = composeLede(
      board({ offers: [application("offered", { expiresAt: "2026-08-03T12:00:00Z" })] }),
      NOW,
    );
    expect(lede.clauseCount).toBe(1);
    expect(lede.sentence).toContain("One thing needs you this week");
    expect(lede.sentence).toContain("expires Monday");
  });

  it("earns its quiet day from real counts", () => {
    const lede = composeLede(
      board({ inMotion: [application("applied"), application("reviewing")] }),
      NOW,
    );
    expect(lede.sentence).toBe(
      "Nothing needs you today — 2 applications are moving, and 7 saved roles are waiting.",
    );
  });
});

/* ── the week ────────────────────────────────────────────────────────────── */

describe("buildWeekQueue", () => {
  it("orders by deadline, marks the offer primary, urgency by arithmetic", () => {
    const week = buildWeekQueue(
      board({
        offers: [application("offered", { expiresAt: "2026-08-03T12:00:00Z" })],
        watching: [
          {
            listing: listing("Whitewater Guide", "Cascade Rapids Co."),
            closesAt: "2026-08-01T12:00:00Z",
          },
        ],
        invites: [
          {
            id: "inv1",
            listingId: "l1",
            listingTitle: "Guest Services",
            location: "Sandpoint, Idaho",
            expiresAt: "2026-08-04T12:00:00Z",
          },
        ],
      }),
      NOW,
    );

    expect(week.map((row) => row.ctaLabel)).toEqual([
      "Apply",
      "Review offer",
      "View invite",
    ]);
    const offer = week[1];
    expect(offer.primary).toBe(true);
    // Aug 3 is five days out — not urgent; Aug 1 is three days out — urgent.
    expect(offer.urgent).toBe(false);
    expect(week[0].urgent).toBe(true);
    expect(week[0].dayLabel).toBe("SAT");
  });

  it("queues a listing-less offer as due now, with only provable words", () => {
    const week = buildWeekQueue(
      board({ offers: [application("offered", { expiresAt: null, listing: null })] }),
      NOW,
    );
    expect(week).toHaveLength(1);
    expect(week[0].title).toBe("Decide on the offer waiting for you");
    expect(week[0].dayLabel).toBe("TODAY");
    expect(week[0].primary).toBe(true);
  });

  it("caps at four rows and drops undated items entirely", () => {
    const watching = Array.from({ length: 6 }, (_, index) => ({
      listing: listing(`Role ${index}`, `Host ${index}`),
      closesAt: `2026-08-0${index + 1}T12:00:00Z`,
    }));
    const undated = { listing: listing("No deadline", "Host"), closesAt: null };
    const week = buildWeekQueue(board({ watching: [...watching, undated] }), NOW);
    expect(week).toHaveLength(4);
    expect(week.some((row) => row.title.startsWith("No deadline"))).toBe(false);
  });
});

/* ── recency + movement ──────────────────────────────────────────────────── */

describe("relativeRecency", () => {
  it("speaks hours, yesterday, days, then dates", () => {
    expect(relativeRecency("2026-07-29T10:00:00Z", NOW)).toBe("2h ago");
    expect(relativeRecency("2026-07-28T09:00:00Z", NOW)).toBe("yesterday");
    expect(relativeRecency("2026-07-26T09:00:00Z", NOW)).toBe("3 days ago");
    expect(relativeRecency("2026-07-01T09:00:00Z", NOW)).toBe("Jul 1");
    expect(relativeRecency(null, NOW)).toBeNull();
  });
});

describe("movementLine", () => {
  it("reports host movement only when reviewed_at exists", () => {
    expect(
      movementLine(
        application("reviewing", { reviewedAt: "2026-07-28T09:00:00Z" }),
        NOW,
      ),
    ).toBe("Host began review · yesterday");
    expect(movementLine(application("applied"), NOW)).toContain("Submitted · ");
  });
});

/* ── the season line ─────────────────────────────────────────────────────── */

describe("buildSeasonLine", () => {
  it("returns null when nothing carries a date — no decorative timeline", () => {
    expect(buildSeasonLine(board(), NOW)).toBeNull();
    expect(
      buildSeasonLine(board({ inMotion: [application("applied")] }), NOW),
    ).toBeNull();
  });

  it("draws spans only from complete date pairs, marks from begins-only", () => {
    const line = buildSeasonLine(
      board({
        offers: [
          application("offered", {
            expiresAt: "2026-08-03T12:00:00Z",
            listing: listing("Lakeside Lead", "North Ridge Lodge", {
              begins: "2026-11-20T00:00:00Z",
              ends: "2027-03-28T00:00:00Z",
            }),
          }),
        ],
        inMotion: [
          application("reviewing", {
            id: "app-trail",
            listing: listing("Trail Crew", "Selway Outfitters", {
              begins: "2026-09-08T00:00:00Z",
            }),
          }),
        ],
      }),
      NOW,
    );

    expect(line).not.toBeNull();
    expect(line!.spans).toHaveLength(1);
    expect(line!.spans[0].kind).toBe("offer");
    expect(line!.spans[0].endPct).toBeGreaterThan(line!.spans[0].startPct);
    const kinds = line!.marks.map((mark) => mark.kind);
    expect(kinds).toContain("today");
    expect(kinds).toContain("decision");
    expect(kinds).toContain("begins");
    for (const mark of line!.marks) {
      expect(mark.pct).toBeGreaterThanOrEqual(0);
      expect(mark.pct).toBeLessThanOrEqual(100);
    }
  });
});
