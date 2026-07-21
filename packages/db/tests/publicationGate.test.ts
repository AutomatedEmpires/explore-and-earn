/**
 * The publication gate (founder, 2026-07-17).
 *
 * A host-controlled listing may not face seekers while Housing, Meals or Pay is
 * unanswered. Drafts may be incomplete. A blank field is NEVER a "no".
 *
 * These pin the RULE. The DB constraint (070 listings_publication_triad_chk) is
 * the enforcement — PostgREST hands `authenticated` full-column UPDATE on
 * listings, so a determined client never executes this module at all. What this
 * suite guarantees is that the host is told the truth about WHY, in the form and
 * from the server, with one shared answer.
 */

import { describe, expect, it } from "vitest";

import {
  benefitCardState,
  hostBenefitDecision,
  validateListingForPublication,
} from "@explore-and-earn/contracts";

const complete = {
  provenance: "verified",
  housingEvidence: "confirmed",
  housingIncluded: false,
  mealsEvidence: "confirmed",
  payEvidence: "confirmed",
  payMinCents: 22_000,
} as const;

const fieldsOf = (v: ReturnType<typeof validateListingForPublication>) =>
  v.ok ? [] : v.blockers.map((b) => b.field);

describe("a host-controlled listing must answer the triad to publish", () => {
  it("publishes when every benefit is an explicit host decision", () => {
    expect(validateListingForPublication(complete)).toEqual({ ok: true });
  });

  it("BLOCKS a blank Housing — the founder rule, and the bug this replaces", () => {
    // The old code read a blank housing box as "Not included" + confirmed.
    // Now it blocks instead, and says so.
    const v = validateListingForPublication({ ...complete, housingEvidence: "not_stated" });
    expect(v.ok).toBe(false);
    expect(fieldsOf(v)).toEqual(["housing"]);
  });

  it("BLOCKS confirmed Housing evidence without an explicit yes/no value", () => {
    const v = validateListingForPublication({
      provenance: "verified",
      housingEvidence: "confirmed",
      mealsEvidence: "confirmed",
      payEvidence: "confirmed",
      payMinCents: 22_000,
    });
    expect(v.ok).toBe(false);
    expect(fieldsOf(v)).toEqual(["housing"]);
  });

  it("BLOCKS a blank Meals", () => {
    const v = validateListingForPublication({ ...complete, mealsEvidence: "not_stated" });
    expect(fieldsOf(v)).toEqual(["meals"]);
  });

  it("publishes an explicit 'not included' — a no IS an answer", () => {
    // The whole point of the tri-state: refusing to publish silence must not
    // become refusing to publish a negative. "No housing" is honest and useful.
    expect(validateListingForPublication(complete)).toEqual({ ok: true });
    expect(validateListingForPublication({ ...complete, housingEvidence: "confirmed" })).toEqual({
      ok: true,
    });
  });

  it("treats a MISSING evidence field as unanswered, not as permission", () => {
    // Fail closed: a caller that forgets to pass evidence must not thereby
    // publish an unanswered listing.
    const v = validateListingForPublication({ provenance: "verified", payMinCents: 100 });
    expect(fieldsOf(v)).toEqual(["housing", "meals", "pay"]);
  });

  it("reports EVERY blocker at once, not just the first", () => {
    const v = validateListingForPublication({
      provenance: "verified",
      housingEvidence: "not_stated",
      mealsEvidence: "not_stated",
      payEvidence: "not_stated",
    });
    expect(fieldsOf(v)).toEqual(["housing", "meals", "pay"]);
  });

  it("gives the host a reason, not just a field name", () => {
    const v = validateListingForPublication({ ...complete, housingEvidence: "not_stated" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.blockers[0].reason.length).toBeGreaterThan(20);
  });
});

describe("only a HOST decision publishes a host-controlled listing", () => {
  // The claim seam. A sourced listing converts to host-controlled while it is
  // already live, so if a source's `stated` satisfied the gate, a claimed
  // listing could stay published forever on an answer its new host never gave.
  // Founder decision 4 protects sourced inventory UNTIL it is claimed — it does
  // not survive the claim.

  it("BLOCKS a verified listing carrying only a SOURCE's 'stated' evidence", () => {
    const v = validateListingForPublication({ ...complete, housingEvidence: "stated" });
    expect(v.ok).toBe(false);
    expect(fieldsOf(v)).toEqual(["housing"]);
  });

  it("blocks every benefit that is merely source-stated", () => {
    const v = validateListingForPublication({
      provenance: "verified",
      housingEvidence: "stated",
      mealsEvidence: "stated",
      payEvidence: "stated",
      payMinCents: 30_000,
    });
    expect(fieldsOf(v)).toEqual(["housing", "meals", "pay"]);
  });

  it("…but the same evidence is fine while the listing is still sourced", () => {
    expect(
      validateListingForPublication({
        provenance: "sourced",
        housingEvidence: "stated",
        mealsEvidence: "not_stated",
      }),
    ).toEqual({ ok: true });
  });
});

describe("pay needs a figure, not merely a decision", () => {
  it("BLOCKS pay that was answered but carries no number", () => {
    const v = validateListingForPublication({
      ...complete,
      payMinCents: null,
      payMaxCents: null,
    });
    expect(fieldsOf(v)).toEqual(["pay"]);
  });

  it("accepts a max-only or min-only range", () => {
    expect(validateListingForPublication({ ...complete, payMinCents: null, payMaxCents: 30_000 })).toEqual({ ok: true });
  });

  it("does not accept zero as a stated rate", () => {
    const v = validateListingForPublication({ ...complete, payMinCents: 0, payMaxCents: 0 });
    expect(fieldsOf(v)).toEqual(["pay"]);
  });
});

describe("hostBenefitDecision — what gets WRITTEN, value and evidence together", () => {
  // This is the rule the original bug inverted, and it went unguarded: an
  // adversarial pass restored the old "blank means not included, confirmed"
  // behaviour and the entire suite still passed. These are the tests that
  // were missing.

  it("an unanswered benefit is never written as a CONFIRMED no", () => {
    // The exact production bug: housing_included=false + evidence='confirmed'
    // for a host who said nothing. `false` is honest as a VALUE (nobody said
    // yes) — what made it a lie was claiming someone confirmed it.
    expect(hostBenefitDecision(undefined)).toEqual({ included: false, evidence: "not_stated" });
    expect(hostBenefitDecision("not_stated")).toEqual({ included: false, evidence: "not_stated" });
  });

  it("records an explicit host YES as confirmed", () => {
    expect(hostBenefitDecision("provided")).toEqual({ included: true, evidence: "confirmed" });
  });

  it("records an explicit host NO as confirmed too — a no IS a decision", () => {
    // The value is identical to the unanswered case; only the evidence tells
    // them apart. That is why the two must always be written as a pair.
    expect(hostBenefitDecision("not_provided")).toEqual({ included: false, evidence: "confirmed" });
  });

  it("distinguishes 'host says no' from 'nobody said' on evidence alone", () => {
    const saidNo = hostBenefitDecision("not_provided");
    const saidNothing = hostBenefitDecision(undefined);
    expect(saidNo.included).toBe(saidNothing.included); // same value…
    expect(saidNo.evidence).not.toBe(saidNothing.evidence); // …different truth
  });

  it("treats 'partial' as included", () => {
    expect(hostBenefitDecision("partial")).toEqual({ included: true, evidence: "confirmed" });
  });

  it("degrades an UNRECOGNISED value to not_stated, never to a confirmed yes", () => {
    // The old shape was `included: provision !== "not_provided"`, so dirty data
    // or an unsafe cast was recorded as a CONFIRMED YES — the original bug
    // wearing a different hat. An allow-list can't do that.
    for (const junk of ["yes", "PROVIDED", "", "unknown_future_member"]) {
      expect(hostBenefitDecision(junk as never)).toEqual({
        included: false,
        evidence: "not_stated",
      });
    }
  });
});

describe("benefitCardState — what the CARD may claim", () => {
  // Found by driving the real host form in a browser: the card announced
  // `aria-label="Housing: included"` for a listing whose host had answered
  // nothing, because it computed state as `provision !== "not_provided"`.
  // Neither the type checker nor any test caught it. These are those tests.

  it("NEVER says included for an unanswered benefit", () => {
    expect(benefitCardState("not_stated")).toBe("not_stated");
  });

  it("NEVER says included for a MISSING provision", () => {
    // The nastier half: a caller that simply never supplied the field got
    // "included" — a promise invented out of nothing at all.
    expect(benefitCardState(undefined)).toBe("not_stated");
  });

  it("says included only for what a host actually said yes to", () => {
    expect(benefitCardState("provided")).toBe("provided");
    expect(benefitCardState("partial")).toBe("provided");
  });

  it("says not included for an explicit host no", () => {
    expect(benefitCardState("not_provided")).toBe("not_provided");
  });

  it("lets evidence overrule a provision — a card must not out-claim its evidence", () => {
    expect(benefitCardState("provided", "not_stated")).toBe("not_stated");
  });

  it("keeps a confirmed/stated evidence out of the way", () => {
    expect(benefitCardState("provided", "confirmed")).toBe("provided");
    expect(benefitCardState("not_provided", "stated")).toBe("not_provided");
  });

  it("degrades an UNRECOGNISED value to not_stated — in BOTH directions", () => {
    // The docstring promised an allow-list, but the code fell through to
    // "not_provided" — inventing a NO exactly the way the original bug invented
    // a YES. Unknown is not a decision, so it cannot become one either way.
    for (const junk of ["yes", "PROVIDED", "", "unknown_future_member"]) {
      expect(benefitCardState(junk as never)).toBe("not_stated");
    }
  });
});

describe("sourced listings are exempt — founder decision 4", () => {
  it("lets an unclaimed sourced listing keep showing 'Not stated'", () => {
    // There is no host to make the decision. Demanding one would either block
    // honest inventory or invite someone to invent an answer for a stranger.
    expect(
      validateListingForPublication({
        provenance: "sourced",
        housingEvidence: "not_stated",
        mealsEvidence: "not_stated",
        payEvidence: "not_stated",
      }),
    ).toEqual({ ok: true });
  });

  it("but a listing with NO provenance stated is treated as host-controlled", () => {
    // Fail closed again: absence of provenance must not buy the sourced
    // exemption, or every writer that forgets the field skips the gate.
    const v = validateListingForPublication({ housingEvidence: "not_stated" });
    expect(v.ok).toBe(false);
  });
});
