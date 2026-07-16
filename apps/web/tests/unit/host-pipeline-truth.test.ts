/**
 * Host pipeline truthfulness invariants:
 *
 *  - Card actions render ONLY edges that are legal from the RAW application
 *    status per APPLICATION_TRANSITIONS (an accepted or closed application
 *    offers no actions instead of four that bounce off the DB trigger).
 *  - The 'accepted' stage exists and engagement states never regress to "New".
 *  - The terminal-negative bucket is labelled "Closed" (it holds host passes,
 *    seeker withdrawals/declines AND expiries — "Declined" was a lie for two
 *    of the three).
 */
import { describe, expect, it } from "vitest";

import {
  APPLICANT_STAGE_LABEL,
  APPLICANT_STAGE_ORDER,
  countByStage,
  legalCardActions,
} from "../../components/host/models";

describe("legalCardActions", () => {
  it("offers Skip/Save/Offer from 'applied' (never Accept)", () => {
    expect(legalCardActions("applied").map((a) => a.label)).toEqual([
      "Skip",
      "Save",
      "Offer",
    ]);
  });

  it("offers Skip/Offer from 'saved_by_host' (Save is not a self-edge)", () => {
    expect(legalCardActions("saved_by_host").map((a) => a.label)).toEqual([
      "Skip",
      "Offer",
    ]);
  });

  it("offers only Accept from 'offered' — host pass on a live offer is not a legal edge", () => {
    expect(legalCardActions("offered").map((a) => a.label)).toEqual(["Accept"]);
  });

  it("terminal and engagement states expose NO actions", () => {
    for (const status of ["accepted", "active", "completed", "not_selected", "withdrawn", "expired"]) {
      expect(legalCardActions(status)).toEqual([]);
    }
  });

  it("unknown statuses expose no actions rather than guessed ones", () => {
    expect(legalCardActions("garbage")).toEqual([]);
  });
});

describe("applicant stages", () => {
  it("includes 'accepted' in the funnel order between offered and the closed bucket", () => {
    const order = [...APPLICANT_STAGE_ORDER];
    expect(order.indexOf("accepted")).toBe(order.indexOf("offered") + 1);
    expect(order.indexOf("accepted")).toBeLessThan(order.indexOf("declined"));
  });

  it("labels the terminal-negative bucket 'Closed'", () => {
    expect(APPLICANT_STAGE_LABEL.declined).toBe("Closed");
    expect(APPLICANT_STAGE_LABEL.accepted).toBe("Accepted");
  });

  it("countByStage tallies the accepted column", () => {
    const counts = countByStage([
      {
        id: "a",
        applicantName: "A",
        listing: { id: "l" } as never,
        stage: "accepted",
        status: "accepted",
        appliedOn: "May 1, 2026",
      },
    ]);
    expect(counts.accepted).toBe(1);
  });
});
