/**
 * The host listing status controls — the buttons a host is actually offered.
 *
 * The point of these tests is REACHABILITY. Before the founder's 2026-07-26
 * decision the host UI had no publish affordance at all: under_review offered
 * only "back to draft", so a completed listing could never be put in front of
 * seekers from this surface. A regression here is invisible in every other test
 * in the repo, because the server would still accept the transition — nothing
 * would ever ask it to.
 */

import { describe, expect, it } from "vitest";

import type { ListingStatus } from "@explore-and-earn/contracts";

import {
  HOST_STATUS_HINT,
  HOST_STATUS_LABEL,
  hostListingTransitions,
} from "../../components/host/listingStatusTransitions";

const ALL_STATUSES: readonly ListingStatus[] = [
  "draft",
  "under_review",
  "live",
  "paused",
  "closed",
  "archived",
];

function targets(status: ListingStatus, provenance?: string | null): string[] {
  return hostListingTransitions(status, provenance).map((t) => t.target);
}

describe("hostListingTransitions", () => {
  it("offers a PUBLISH action on a completed listing", () => {
    expect(targets("under_review")).toContain("live");
  });

  it("labels it as publishing, not as submitting for a review nobody performs", () => {
    const publish = hostListingTransitions("under_review").find(
      (t) => t.target === "live",
    );
    expect(publish?.label).toBe("Publish now");
    expect(publish?.variant).toBe("primary");
    for (const transition of hostListingTransitions("under_review")) {
      expect(transition.label).not.toMatch(/review/i);
    }
  });

  it("still routes a draft through the ready step — never straight to live", () => {
    expect(targets("draft")).toEqual(["under_review"]);
    expect(targets("draft")).not.toContain("live");
  });

  it("offers a way out of closed", () => {
    expect(targets("closed")).toEqual(["draft"]);
  });

  it("offers NOTHING on a sourced closed listing — the origin withdrew it", () => {
    // Migration 082 refuses closed -> draft for provenance='sourced'. Drawing
    // the button anyway would be an action the database rejects.
    expect(targets("closed", "sourced")).toEqual([]);
    expect(targets("closed", "verified")).toEqual(["draft"]);
  });

  it("leaves provenance out of it for every other status", () => {
    for (const status of ALL_STATUSES) {
      if (status === "closed") continue;
      expect(targets(status, "sourced")).toEqual(targets(status, "verified"));
    }
  });

  it("keeps archived terminal", () => {
    expect(targets("archived")).toEqual([]);
  });

  it("never offers a target the host action cannot express", () => {
    for (const status of ALL_STATUSES) {
      for (const target of targets(status)) {
        expect(target).not.toBe("closed");
        expect(target).not.toBe(status);
      }
    }
  });

  it("gives every status a label and a hint", () => {
    for (const status of ALL_STATUSES) {
      expect(HOST_STATUS_LABEL[status].length).toBeGreaterThan(0);
      expect(HOST_STATUS_HINT[status].length).toBeGreaterThan(0);
    }
  });

  it("does not tell the host their listing is under review", () => {
    // There is no reviewer. The badge and the hint both have to say so.
    expect(HOST_STATUS_LABEL.under_review).toBe("Ready to publish");
    expect(HOST_STATUS_HINT.under_review).not.toMatch(/review/i);
  });
});
