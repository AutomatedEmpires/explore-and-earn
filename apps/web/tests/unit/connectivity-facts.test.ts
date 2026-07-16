/**
 * "Getting online" panel — the rules about WHAT MAY BE SHOWN.
 *
 * These pin the honesty decisions at the RENDER boundary (the contract tests
 * pin them at the storage boundary):
 *  - Only facts the host actually stated become cells. There is no "Not stated"
 *    placeholder row — absence is silence, and the section itself is gated
 *    upstream on hasLogistics() so a seeker never reads a wall of blanks.
 *  - "No internet here" is the ENTIRE answer: no cell may describe a connection
 *    the host says doesn't exist.
 *  - A stated speed always carries the approximate/host-reported caveat.
 *  - An old report is labelled old; an UNDATED one says so rather than passing
 *    as current.
 */

import { describe, expect, it } from "vitest";

import {
  buildConnectivityFacts,
  locationsLabel,
} from "../../components/listing/connectivityFactsModel";

const NOW = Date.parse("2026-07-16T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const labels = (facts: readonly { label: string }[]) => facts.map((f) => f.label);
const valueOf = (facts: readonly { label: string; value: string }[], label: string) =>
  facts.find((f) => f.label === label)?.value;

describe("buildConnectivityFacts — only what the host stated", () => {
  it("renders a cell per stated fact and nothing more", () => {
    const model = buildConnectivityFacts(
      {
        available: true,
        cost: "included",
        locations: ["housing"],
        connectionType: "satellite",
        downloadMbps: 25,
        reportedAt: daysAgo(3),
      },
      NOW,
    );
    expect(labels(model.facts)).toEqual([
      "Internet",
      "Cost",
      "Where it works",
      "Connection",
      "Approx. speed (Mbps)",
    ]);
    // Nothing the host left alone appears at all — no placeholder cells.
    expect(labels(model.facts)).not.toContain("Reliability");
    expect(labels(model.facts)).not.toContain("Data limit");
    expect(labels(model.facts)).not.toContain("Video calls");
  });

  it("shows nothing but the answer when the host says there is NO internet", () => {
    const model = buildConnectivityFacts({ available: false }, NOW);
    expect(model.noInternet).toBe(true);
    expect(model.facts).toHaveLength(1);
    expect(model.facts[0].value).toContain("no internet here");
    // A "no internet" listing must never carry a speed caveat — there's no speed.
    expect(model.showsSpeedCaveat).toBe(false);
  });

  it("a host who stated only 'yes' gets exactly one cell", () => {
    const model = buildConnectivityFacts({ available: true }, NOW);
    expect(labels(model.facts)).toEqual(["Internet"]);
  });

  it("distinguishes an explicit no from silence on the boolean facts", () => {
    const capped = buildConnectivityFacts(
      { available: true, dataCapped: false, videoCallSuitable: false },
      NOW,
    );
    expect(valueOf(capped.facts, "Data limit")).toBe("Unlimited");
    expect(valueOf(capped.facts, "Video calls")).toBe("Host says these don't work");

    // Unstated → the cells simply don't exist (not "Unlimited", not "No").
    const silent = buildConnectivityFacts({ available: true }, NOW);
    expect(labels(silent.facts)).not.toContain("Data limit");
    expect(labels(silent.facts)).not.toContain("Video calls");
  });

  it("a stated speed ALWAYS carries the approximate caveat", () => {
    expect(buildConnectivityFacts({ available: true, downloadMbps: 50 }, NOW).showsSpeedCaveat).toBe(
      true,
    );
    expect(buildConnectivityFacts({ available: true, uploadMbps: 5 }, NOW).showsSpeedCaveat).toBe(
      true,
    );
    expect(buildConnectivityFacts({ available: true }, NOW).showsSpeedCaveat).toBe(false);
  });

  it("renders a one-sided speed without inventing the other half", () => {
    const model = buildConnectivityFacts({ available: true, downloadMbps: 40 }, NOW);
    expect(valueOf(model.facts, "Approx. speed (Mbps)")).toBe("40 down");
  });
});

describe("locationsLabel — never a guessed 'everywhere'", () => {
  it("names only the places the host actually stated", () => {
    expect(locationsLabel(["housing", "worksite"])).toBe("In housing and at the worksite");
    expect(locationsLabel(["housing"])).toBe("In housing");
    expect(locationsLabel(["worksite"])).toBe("At the worksite");
  });

  it("returns null (no cell) rather than a placeholder when nothing is stated", () => {
    expect(locationsLabel([])).toBeNull();
  });
});

describe("freshness note — an undated report never passes as current", () => {
  it("says so when the host never dated the report", () => {
    expect(buildConnectivityFacts({ available: true }, NOW).note).toEqual({ kind: "undated" });
  });

  it("stays quiet for a recent report", () => {
    expect(buildConnectivityFacts({ available: true, reportedAt: daysAgo(5) }, NOW).note).toBeNull();
  });

  it("hedges an aging report and warns on a stale one", () => {
    expect(buildConnectivityFacts({ available: true, reportedAt: daysAgo(200) }, NOW).note).toEqual({
      kind: "aging",
    });
    expect(buildConnectivityFacts({ available: true, reportedAt: daysAgo(400) }, NOW).note).toEqual({
      kind: "stale",
    });
  });

  it("ages a 'no internet' answer too — it can go out of date like any other", () => {
    expect(buildConnectivityFacts({ available: false, reportedAt: daysAgo(400) }, NOW).note).toEqual(
      { kind: "stale" },
    );
  });
});
