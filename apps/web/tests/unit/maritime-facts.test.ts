/**
 * "The vessel" panel — the rules about WHAT MAY BE SHOWN.
 *
 * The storage boundary (packages/db/tests/categoryDepthContract.test.ts) stops
 * a claim being persisted; these stop one being shown:
 *  - Only facts the host actually stated become cells. There is no "Not stated"
 *    placeholder row — absence is silence, and the section is gated upstream on
 *    hasCategoryDepth() so a seeker never reads a wall of blanks.
 *  - "You don't sleep aboard" is PRESERVED, not collapsed into silence. It is
 *    the most decision-changing answer here and it is not the same as unasked.
 *  - …but unlike connectivity's "no internet", it does NOT suppress the other
 *    facts: not sleeping aboard says nothing about the size of the boat.
 *  - A stated length always carries the approximate caveat.
 *  - An old report is labelled old; an UNDATED one says so rather than passing
 *    as current.
 */

import { describe, expect, it } from "vitest";

import { buildMaritimeFacts } from "../../components/listing/maritimeFactsModel";

const NOW = Date.parse("2026-07-16T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const labels = (facts: readonly { label: string }[]) => facts.map((f) => f.label);
const valueOf = (facts: readonly { label: string; value: string }[], label: string) =>
  facts.find((f) => f.label === label)?.value;

describe("buildMaritimeFacts — only what the host stated", () => {
  it("renders a cell per stated fact, in a stable order, and nothing more", () => {
    const model = buildMaritimeFacts(
      {
        vesselType: "tall_ship",
        lengthFeet: 148,
        berthAboard: true,
        berthType: "bunk_shared",
        crewSize: 12,
        reportedAt: daysAgo(3),
      },
      NOW,
    );
    expect(labels(model.facts)).toEqual([
      "Vessel",
      "Approx. length",
      "Sleep aboard",
      "Your berth",
      "Crew aboard",
    ]);
  });

  it("omits unstated facts entirely — no placeholder cells", () => {
    const model = buildMaritimeFacts({ vesselType: "workboat" }, NOW);
    expect(labels(model.facts)).toEqual(["Vessel"]);
    expect(labels(model.facts)).not.toContain("Sleep aboard");
    expect(labels(model.facts)).not.toContain("Crew aboard");
    expect(labels(model.facts)).not.toContain("Approx. length");
  });

  it("PRESERVES an explicit 'you do not sleep aboard' — the decisive answer", () => {
    // The fact that silently decides whether a seeker must fund housing ashore.
    // Truthiness on this key would erase it; `!== undefined` keeps it.
    const model = buildMaritimeFacts({ berthAboard: false }, NOW);
    expect(labels(model.facts)).toEqual(["Sleep aboard"]);
    expect(valueOf(model.facts, "Sleep aboard")).toContain("No");
  });

  it("distinguishes an explicit no from silence on sleeping aboard", () => {
    expect(valueOf(buildMaritimeFacts({ berthAboard: true }, NOW).facts, "Sleep aboard")).toContain(
      "Yes",
    );
    expect(labels(buildMaritimeFacts({ crewSize: 4 }, NOW).facts)).not.toContain("Sleep aboard");
  });

  it("does NOT suppress other facts when the crew sleeps ashore", () => {
    // Unlike connectivity's "no internet", which makes speeds incoherent, not
    // sleeping aboard says nothing about the vessel. Copying slice 1's collapse
    // here would hide facts the host really did state.
    const model = buildMaritimeFacts(
      { berthAboard: false, vesselType: "charter_boat", lengthFeet: 62, crewSize: 5 },
      NOW,
    );
    expect(labels(model.facts)).toEqual([
      "Vessel",
      "Approx. length",
      "Sleep aboard",
      "Crew aboard",
    ]);
  });

  it("a stated length ALWAYS carries the approximate caveat", () => {
    expect(buildMaritimeFacts({ lengthFeet: 40 }, NOW).showsLengthCaveat).toBe(true);
    expect(buildMaritimeFacts({ vesselType: "liveaboard" }, NOW).showsLengthCaveat).toBe(false);
  });

  it("reads a solo crew as solo rather than '1 including you'", () => {
    expect(valueOf(buildMaritimeFacts({ crewSize: 1 }, NOW).facts, "Crew aboard")).toBe("1 (solo)");
    expect(valueOf(buildMaritimeFacts({ crewSize: 6 }, NOW).facts, "Crew aboard")).toBe(
      "6 including you",
    );
  });
});

describe("freshness note — an undated report never passes as current", () => {
  it("says so when the host never dated the report", () => {
    expect(buildMaritimeFacts({ crewSize: 3 }, NOW).note).toEqual({ kind: "undated" });
  });

  it("stays quiet for a recent report", () => {
    expect(buildMaritimeFacts({ crewSize: 3, reportedAt: daysAgo(5) }, NOW).note).toBeNull();
  });

  it("hedges an aging report and warns on a stale one", () => {
    expect(buildMaritimeFacts({ crewSize: 3, reportedAt: daysAgo(200) }, NOW).note).toEqual({
      kind: "aging",
    });
    expect(buildMaritimeFacts({ crewSize: 3, reportedAt: daysAgo(400) }, NOW).note).toEqual({
      kind: "stale",
    });
  });
});
