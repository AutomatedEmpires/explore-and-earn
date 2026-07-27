/**
 * hostAccountState — the decode behind every sentence the pre-billing host
 * reads (commercial redesign D6).
 *
 * NOT A GATE, and these tests are deliberately not written as if it were. What
 * they pin is that the four states stay DISTINCT, because the whole point of the
 * helper is that "no plan" and "plan in trouble" get opposite copy: one is
 * invited to activate, the other is already a customer and must never be told to
 * buy something they have.
 */
import { describe, expect, it } from "vitest";

import {
  hostAccountState,
  isProspectHostAccount,
  type HostAccountState,
} from "../src/lib/hostAccountState.js";

describe("hostAccountState — prospect", () => {
  it("treats a missing subscription row as a prospect", () => {
    // The state of every account that has never opened checkout, which under
    // migration 086 can now also hold a fully built workspace.
    expect(hostAccountState(null)).toBe("prospect");
    expect(hostAccountState(undefined)).toBe("prospect");
    expect(hostAccountState({})).toBe("prospect");
  });

  it("treats tier none with no or cancelled billing as a prospect", () => {
    expect(hostAccountState({ tier: "none", billingStatus: "none" })).toBe("prospect");
    // A host who churned completely is offered activation, not recovery: there
    // is nothing left in the billing portal for them to settle.
    expect(hostAccountState({ tier: "none", billingStatus: "cancelled" })).toBe(
      "prospect",
    );
  });

  it("does not read an unknown tier as entitlement", () => {
    // Degrading toward 'prospect' is the safe direction for COPY as well as for
    // gates: the worst case is offering a plan to someone who has one, and the
    // states above are the only ones the webhook ever writes.
    expect(hostAccountState({ tier: "nonsense", billingStatus: "active" })).toBe(
      "prospect",
    );
  });
});

describe("hostAccountState — lapsed", () => {
  /**
   * THE DISTINCTION THIS HELPER EXISTS FOR. The Stripe webhook collapses tier to
   * 'none' for every status outside active/trialing/past_due, so a host in
   * dunning looks identical to a host who never paid IF you read the tier alone.
   * They are not the same person and must not get the same sentence.
   */
  it.each(["past_due", "unpaid", "paused"])(
    "reads tier none with billing %s as lapsed, not prospect",
    (billingStatus) => {
      const state = hostAccountState({ tier: "none", billingStatus });
      expect(state).toBe("lapsed");
      expect(isProspectHostAccount(state)).toBe(false);
    },
  );
});

describe("hostAccountState — paying", () => {
  it.each(["starter", "professional", "enterprise"])(
    "reads a %s tier as active",
    (tier) => {
      expect(hostAccountState({ tier, billingStatus: "active" })).toBe("active");
      expect(hostAccountState({ tier, billingStatus: "trialing" })).toBe("active");
      // Still paying through dunning — resolveSubscriptionTier keeps 'past_due'
      // entitled, so nothing about their workspace changes.
      expect(hostAccountState({ tier, billingStatus: "past_due" })).toBe("active");
    },
  );

  it("marks a paid tier that will not renew as cancelled, never prospect", () => {
    // Entitled until the period ends. Gating them, or offering them activation,
    // would both be wrong while the database still lets them publish.
    const state = hostAccountState({ tier: "professional", billingStatus: "cancelled" });
    expect(state).toBe("cancelled");
    expect(isProspectHostAccount(state)).toBe(false);
  });
});

describe("hostAccountState — exhaustiveness", () => {
  it("returns only the four declared states across the whole matrix", () => {
    const tiers = ["none", "starter", "professional", "enterprise", "bogus"];
    const statuses = [
      "none",
      "trialing",
      "active",
      "past_due",
      "cancelled",
      "unpaid",
      "paused",
    ];
    const allowed: readonly HostAccountState[] = [
      "prospect",
      "lapsed",
      "active",
      "cancelled",
    ];
    for (const tier of tiers) {
      for (const billingStatus of statuses) {
        expect(allowed).toContain(hostAccountState({ tier, billingStatus }));
      }
    }
  });

  it("only ever calls the unpaid states prospect", () => {
    // The one-way property the banner depends on: no paid tier may produce
    // 'prospect' under any billing status, or a paying host meets an activation
    // banner.
    for (const tier of ["starter", "professional", "enterprise"]) {
      for (const billingStatus of ["none", "trialing", "active", "past_due", "cancelled", "unpaid", "paused"]) {
        expect(hostAccountState({ tier, billingStatus })).not.toBe("prospect");
      }
    }
  });
});
