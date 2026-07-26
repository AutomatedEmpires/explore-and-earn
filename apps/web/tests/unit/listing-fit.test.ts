/**
 * The listing-detail fit resolution rule (apps/web/lib/listingFit.ts).
 *
 * These tests assert the REFUSALS, because every defect this module exists to
 * fix was a surface asserting more than it knew:
 *  - a page announcing a band the card it was opened from does not agree with
 *  - a page announcing a band when no score exists at all
 *  - a page omitting a blocker because its local input set could not see it
 */
import { describe, expect, it } from "vitest";
import type { MatchTrace } from "@explore-and-earn/contracts";
import type { StoredMatchResult } from "@explore-and-earn/db";

import { resolveListingFit } from "../../lib/listingFit";

function stored(overrides: Partial<StoredMatchResult> = {}): StoredMatchResult {
  return {
    score: 84,
    rawScore: 84,
    band: "strong",
    confidence: 70,
    components: { categoryRoleFit: 90 } as StoredMatchResult["components"],
    capsApplied: [],
    computedAt: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

function localTrace(overrides: Partial<MatchTrace> = {}): MatchTrace {
  return {
    excluded: null,
    score: 72,
    rawScore: 72,
    band: "developing",
    confidence: 40,
    components: { categoryRoleFit: 60 } as MatchTrace["components"],
    capsApplied: [],
    signals: [
      { code: "housing_included_matches_need", component: "housingMealsFit", polarity: "positive" },
      { code: "travel_readiness_unknown", component: "locationTravelFit", polarity: "missing" },
    ],
    ...overrides,
  };
}

describe("resolveListingFit — no stored row means no band", () => {
  it("refuses to show a fit when nothing is stored, EVEN IF a local trace scored well", () => {
    // The exact trap: the local recompute is confident, but the card that opened
    // this page shows no pill, because no stored row exists. Announcing a band
    // here would contradict the card.
    const result = resolveListingFit(null, localTrace({ score: 95, band: "strong" }));
    expect(result.kind).toBe("not_scored");
  });

  it("refuses when there is no stored row and no local trace either", () => {
    expect(resolveListingFit(null, null).kind).toBe("not_scored");
  });
});

describe("resolveListingFit — the stored row is the only number shown", () => {
  it("uses the STORED score/band, never the locally recomputed ones", () => {
    const result = resolveListingFit(stored(), localTrace());
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    // 84/strong is stored; 72/developing is what the local recompute produced.
    expect(result.trace.score).toBe(84);
    expect(result.trace.band).toBe("strong");
    expect(result.trace.rawScore).toBe(84);
    expect(result.trace.confidence).toBe(70);
    expect(result.trace.components).toEqual({ categoryRoleFit: 90 });
  });

  it("works with no local trace at all (stored row alone is sufficient)", () => {
    const result = resolveListingFit(stored(), null);
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.trace.score).toBe(84);
    expect(result.trace.signals).toEqual([]);
  });
});

describe("resolveListingFit — blockers come only from the stored caps", () => {
  it("surfaces a stored cap the local recompute could not have seen", () => {
    // requiredCertificationMissing is gated first on the listing's required
    // certifications, which the detail-page listing mapper never supplies — so
    // only the stored row can know about it.
    const result = resolveListingFit(
      stored({ capsApplied: ["requiredCertificationMissing"], score: 60, band: "developing" }),
      localTrace(),
    );
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    const blockers = result.trace.signals.filter((s) => s.polarity === "blocker");
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.code).toBe("required_certification_missing");
    expect(result.trace.capsApplied).toEqual(["requiredCertificationMissing"]);
  });

  it("DISCARDS a locally derived blocker, so an impoverished result cannot dilute the stored one", () => {
    const result = resolveListingFit(
      stored({ capsApplied: [] }),
      localTrace({
        capsApplied: ["housingRequiredButNotIncluded"],
        signals: [
          { code: "housing_required_not_included", component: null, polarity: "blocker" },
          { code: "pay_meets_expectation", component: "payAlignment", polarity: "positive" },
        ],
      }),
    );
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.trace.signals.filter((s) => s.polarity === "blocker")).toHaveLength(0);
    expect(result.trace.capsApplied).toEqual([]);
    // ...but the qualitative signal alongside it survives.
    expect(result.trace.signals.map((s) => s.code)).toContain("pay_meets_expectation");
  });

  it("keeps qualitative signals, blockers first", () => {
    const result = resolveListingFit(
      stored({ capsApplied: ["visaSupportRequiredButUnavailable"] }),
      localTrace(),
    );
    expect(result.kind).toBe("scored");
    if (result.kind !== "scored") return;
    expect(result.trace.signals[0]?.polarity).toBe("blocker");
    expect(result.trace.signals.map((s) => s.code)).toEqual([
      "visa_support_unavailable",
      "housing_included_matches_need",
      "travel_readiness_unknown",
    ]);
  });
});
