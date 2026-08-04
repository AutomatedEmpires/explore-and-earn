import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * EVERY SEEK FILTER MAPS TO A REAL COLUMN (V2-G Part VII).
 *
 * The failure mode this file exists to prevent is not a crash — it is a control
 * that looks like it works. A filter chip whose param no page reads, or whose
 * predicate no query applies, narrows nothing and tells the seeker it did. They
 * then conclude the marketplace has four listings in it.
 *
 * That is not hypothetical here: `?location`, `?start_after` and `?start_before`
 * were parsed by the /seek page and applied by searchListings for months, and
 * NO CONTROL EVER SET THEM. Three working filters, unreachable. The reverse case
 * is just as real: the filter popover must not grow a control for a column
 * searchListings has no predicate for.
 *
 * So this test walks the whole chain for each filter — control → URL param →
 * page parser → query predicate → column — and separately pins the columns that
 * are deliberately NOT offered, so removing that restraint requires deleting an
 * assertion that says why.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

const dbListings = readFileSync(
  new URL("../../../../packages/db/src/queries/listings.ts", import.meta.url),
  "utf8",
);
const seekPage = read("app/[locale]/(seeker)/seek/page.tsx");
const filterPopup = read("components/seeker/SeekFilterPopup.tsx");
const browser = read("components/seeker/SeekBrowser.tsx");

/** Strip comments so a negative scan cannot be satisfied by prose ABOUT the code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const dbCode = stripComments(dbListings);
const pageCode = stripComments(seekPage);
const popupCode = stripComments(filterPopup);
const browserCode = stripComments(browser);

// ── 1. The filters that exist, end to end ──────────────────────────────────

/** [human name, URL param, SearchFilters key, the predicate's real column] */
const REAL_FILTERS: readonly [string, string, string, string][] = [
  ["free text", "q", "query", "search_vector"],
  ["category", "category", "categories", "category"],
  ["housing", "housing", "hasHousing", "housing_included"],
  ["meals", "meals", "hasMeals", "meals_included"],
  ["visa support", "visa", "visaSupport", "visa_support"],
  ["pay floor", "pay_min", "payMin", "compensation_min_cents"],
  ["pay unit", "pay_unit", "payUnit", "compensation_unit"],
  ["start window", "start_range", "startRangeMonths", "begins_at"],
  ["place", "location", "location", "location_display"],
  ["starts after", "start_after", "startDateAfter", "begins_at"],
  ["starts before", "start_before", "startDateBefore", "begins_at"],
];

describe.each(REAL_FILTERS)(
  "the %s filter",
  (_name, param, filterKey, column) => {
    it(`is parsed from ?${param} by the seek page`, () => {
      expect(pageCode).toContain(`params.${param}`);
    });

    it(`is passed to searchListings as ${filterKey}`, () => {
      expect(pageCode).toContain(`${filterKey}`);
    });

    it(`resolves to a predicate on ${column}`, () => {
      expect(dbCode).toContain(column);
    });
  },
);

describe("the controls actually set the params", () => {
  it.each([
    "housing",
    "meals",
    "visa",
    "start_range",
    "pay_min",
    "pay_unit",
    "location",
    "start_after",
    "start_before",
  ])("the browser writes ?%s", (param) => {
    expect(browserCode).toContain(`"${param}"`);
  });

  /**
   * The regression that motivated this file. Location and the explicit date
   * window were readable by the server and unreachable from the UI.
   */
  it("the filter popover offers place and an exact start window", () => {
    expect(popupCode).toContain("location");
    expect(popupCode).toContain("startAfter");
    expect(popupCode).toContain("startBefore");
    expect(popupCode).toMatch(/type="date"/);
  });

  it("changing a filter resets pagination", () => {
    // Page 3 of the old result set is not page 3 of the new one.
    expect(browserCode).toContain('next.delete("page")');
  });
});

// ── 2. The filters that do NOT exist, and must not be faked ────────────────

describe("no control exists for a column the query cannot filter", () => {
  /**
   * There is no weekly-hours column, no openings column, and no
   * application-deadline column anywhere in the listings table. A control for
   * any of them could only be decorative.
   */
  it.each(["weekly_hours", "hours_per_week", "openings", "application_deadline"])(
    "%s is not a column, so nothing filters on it",
    (column) => {
      expect(dbCode).not.toContain(column);
      expect(popupCode).not.toContain(column);
    },
  );

  /**
   * These two DO have columns (051) — and no predicate in searchListings. A
   * control would have to filter client-side over one page, which lies at every
   * page boundary. Offering them requires adding the predicate first.
   */
  it.each(["experience_level_required", "required_certifications"])(
    "%s has a column but no query predicate, so the popover offers none",
    (column) => {
      expect(dbCode).toContain(column); // selected for DISPLAY
      const searchBlock = dbCode.slice(
        dbCode.indexOf("export async function searchListings"),
        dbCode.indexOf("export interface ListingMatchRequirements"),
      );
      expect(searchBlock).not.toContain(column);
    },
  );

  /**
   * The popover SAYS there is no radius search (that sentence is deliberate
   * copy). What must not exist is a control: no slider, no number field, no
   * param, and no predicate anywhere in the query.
   */
  it("offers no distance/radius CONTROL — listings store a point, not a radius", () => {
    expect(popupCode).not.toMatch(/radiusMiles|withinMiles|distanceKm|radius:/);
    expect(browserCode).not.toMatch(/"radius"|"distance"/);
    expect(dbCode).not.toMatch(/radius|ST_DWithin/i);
  });
});

// ── 3. Sort tells the truth about its own scope ───────────────────────────

describe("sort", () => {
  it("is labelled as page-scoped, because that is what it is", () => {
    // The server pages with .range() and never asks for a count, so a "global"
    // sort would be wrong at every page boundary but the first.
    expect(browser).toContain("Sort this page");
  });

  it("offers match, pay and start-date orders", () => {
    for (const id of ["match", "pay", "soonest"]) {
      expect(browserCode).toContain(`"${id}"`);
    }
  });

  it("never claims a total it cannot count", () => {
    expect(browserCode).toContain("more on the next");
    expect(browserCode).not.toMatch(/of \$\{total\}|totalResults/);
  });
});

// ── 4. Save / skip are wired, not decorative ──────────────────────────────

describe("the decision bar on /seek", () => {
  /**
   * The card renders Skip and Save whenever an open handler exists. /seek
   * supplied one and no action handlers, so both buttons were live, focusable,
   * and silently did nothing on the marketplace's main browse surface.
   */
  it("wires Save and Skip to the exclusive persisted transition", () => {
    expect(browserCode).toContain("setMapListingDecisionAction");
  });

  it("routes a signed-out seeker to sign-in rather than dropping the tap", () => {
    expect(browserCode).toContain("requireAuth");
    expect(browserCode).toContain("role=seeker");
  });

  it("reconciles optimistic state to the server-authoritative decision", () => {
    const decisionStart = browserCode.indexOf("const commitDecision");
    const decisionEnd = browserCode.indexOf("const cardOverrides", decisionStart);
    const decisionFlow = browserCode.slice(decisionStart, decisionEnd);

    expect(decisionStart).toBeGreaterThan(-1);
    expect(decisionEnd).toBeGreaterThan(decisionStart);
    // A resolved action reports the exact persisted outcome after compensation;
    // a rejected action restores the local snapshot without inventing a badge.
    expect(decisionFlow).toContain("setMapListingDecisionAction(id, decision)");
    expect(decisionFlow).toContain(
      "result.decision === undefined ? previous : result.decision",
    );
    expect(decisionFlow).toContain(".catch(() => setCardDecision(id, previous))");
  });
});

// ── 5. Saved searches (041) stay wired ────────────────────────────────────

describe("saved searches", () => {
  it("are read on the seek page and rendered by the browser", () => {
    expect(pageCode).toContain("getSavedSearches");
    expect(browserCode).toContain("<SavedSearches");
  });

  it("fire the created event only after the write succeeds", () => {
    const saved = stripComments(read("components/seeker/SavedSearches.tsx"));
    expect(saved).toMatch(/if \(res\.ok\) \{[\s\S]*savedSearchCreated/);
  });

  it("carry which filter AXES were used, never their values", () => {
    const saved = read("components/seeker/SavedSearches.tsx");
    expect(saved).toContain("axes:");
    expect(saved).toContain(".map(([key]) => key)");
  });
});

// ── 6. The map toggle keeps the seeker's filters ──────────────────────────

describe("the map toggle", () => {
  it("carries the current query string across to /map", () => {
    expect(browserCode).toContain("mapHref");
    expect(browserCode).toContain("/map?");
  });
});
