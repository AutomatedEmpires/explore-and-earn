/**
 * THE PRICE HAS TO EXPLAIN ITSELF BEFORE ANY MONEY MOVES (spec D12).
 *
 * Before this page existed, the last screen on this side of Stripe was three
 * price cards and a button. Everything that decides whether a purchase is a good
 * idea — the exact amount leaving the account today, what renews and when, what
 * the plan actually turns on, how to stop — was somewhere else or nowhere. A
 * price a buyer cannot explain back to you is not a price they agreed to.
 *
 * The assertions here are SOURCE PINS, and they are deliberately about the
 * things that would be quietly dropped in a later edit:
 *
 *   * no seat claim, anywhere (D13 — accepting a team invitation still grants
 *     access to nothing, so no surface may sell one);
 *   * no price literal — every amount derives from the founder-locked contract,
 *     so a summary cannot quote a different number from the one Stripe charges;
 *   * the early-host block is dark by default and its opt-in field exists only
 *     when the database says a place is genuinely claimable;
 *   * the escape hatch is present — a host who wants to keep building must be
 *     able to leave without feeling they have lost their place.
 *
 * COMMENTS ARE STRIPPED before every negative assertion. The page's header
 * explains each of these rules in prose, and a `not.toContain` over raw source
 * would be testing the prose rather than the code.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ADDITIONAL_LISTING_PRICING,
  ADDON_PRICING,
  BOOST_PRICING,
  FOUNDER_LOCKED_PRICING,
  INVITE_CREDIT_PACKS,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

const ACTIVATE = readFileSync(
  new URL(
    "../../app/[locale]/(host-onboard)/host/plans/activate/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const ADDONS = readFileSync(
  new URL("../../components/pricing/AddOnTable.tsx", import.meta.url),
  "utf8",
);

const SECTION = readFileSync(
  new URL("../../components/founding/FoundingHostSection.tsx", import.meta.url),
  "utf8",
);

const COUNTDOWN = readFileSync(
  new URL("../../components/founding/FoundingCountdown.tsx", import.meta.url),
  "utf8",
);

/** Executable source only — a negative assertion must not read documentation. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
}

describe("the activation summary states the whole bargain", () => {
  it("names the amount due today and what renews, with a cadence", () => {
    expect(ACTIVATE).toContain("Due today");
    expect(ACTIVATE).toContain("Renews");
    expect(ACTIVATE).toContain("every 12 months");
    expect(ACTIVATE).toContain("every month");
  });

  it("states the cancellation terms and links the refund policy", () => {
    expect(ACTIVATE).toContain("Cancel at any time");
    expect(ACTIVATE).toContain('href="/refunds"');
  });

  it("says what happens the moment the payment lands", () => {
    expect(ACTIVATE).toContain("AFTER_PAYMENT");
    expect(ACTIVATE).toContain("What happens immediately after payment");
  });

  it("says who takes the payment, and that card details do not reach us", () => {
    expect(ACTIVATE).toContain("Stripe");
    expect(ACTIVATE).toContain("never reach Explore");
  });

  it("derives what activates from the enforced entitlements", () => {
    expect(ACTIVATE).toContain("PLAN_ENTITLEMENTS");
    expect(ACTIVATE).toContain("entitlement.listings");
    expect(ACTIVATE).toContain("entitlement.includedInviteCredits");
    expect(ACTIVATE).toContain("entitlement.analytics");
  });

  it("offers the escape hatch back into the workspace", () => {
    expect(ACTIVATE).toContain("Continue building my profile");
    expect(ACTIVATE).toContain('href="/host"');
  });

  it("reports the activation view to the funnel", () => {
    expect(ACTIVATE).toContain("hostActivationPageViewed");
  });

  it("sends an unrecognised selection back to the chooser instead of guessing", () => {
    expect(ACTIVATE).toContain("isHostSubscriptionTier");
    expect(ACTIVATE).toContain("isBillingInterval");
    expect(ACTIVATE).toContain("/host/plans?error=invalid_plan");
    expect(ACTIVATE).toContain("/host/plans?error=invalid_interval");
  });
});

describe("the activation summary sells nothing it cannot deliver", () => {
  /**
   * D13. Every tier grants zero colleague seats because accepting an invitation
   * grants access to nothing, and packages/db/tests/teamSeatCapability.test.ts
   * holds the entitlement at zero. A page that rendered "0 team seats" would be
   * describing a limit where there is an absence.
   */
  it("makes no seat claim of any kind", () => {
    expect(PLAN_ENTITLEMENTS.enterprise.teamSeats).toBe(0);
    expect(code(ACTIVATE)).not.toMatch(/team seat/i);
    expect(code(ACTIVATE)).not.toContain("teamSeats");
    expect(code(ADDONS)).not.toMatch(/team seat/i);
    expect(code(ADDONS)).not.toContain("teamSeatMonthly");
  });

  /**
   * Every figure derives from the contract. A literal here is how a summary
   * starts quoting a number Stripe does not charge — which is worse than no
   * summary at all.
   */
  it("states no amount of its own", () => {
    const amounts = [
      FOUNDER_LOCKED_PRICING.starter.monthly,
      FOUNDER_LOCKED_PRICING.professional.monthly,
      FOUNDER_LOCKED_PRICING.enterprise.monthly,
      FOUNDER_LOCKED_PRICING.starter.yearly,
      ADDON_PRICING.additionalAnnouncement.priceCents,
    ];
    for (const source of [ACTIVATE, ADDONS, SECTION]) {
      for (const amount of amounts) {
        expect(code(source)).not.toContain(String(amount));
        expect(code(source)).not.toContain(String(amount / 100));
      }
    }
  });

  it("reads its prices through the contract modules", () => {
    expect(ACTIVATE).toContain("FOUNDER_LOCKED_PRICING");
    expect(ACTIVATE).toContain("formatMoney");
    expect(ADDONS).toContain("ADDITIONAL_LISTING_PRICING");
    expect(ADDONS).toContain("BOOST_PRICING");
    expect(ADDONS).toContain("INVITE_CREDIT_PACKS");
    expect(ADDONS).toContain("ADDON_PRICING");
  });
});

describe("the add-on presentation covers the real add-ons", () => {
  it("presents each purchasable add-on, priced from the contract", () => {
    expect(Object.keys(ADDITIONAL_LISTING_PRICING)).toEqual([
      "starter",
      "professional",
      "enterprise",
    ]);
    expect(Object.keys(BOOST_PRICING)).toHaveLength(3);
    expect(INVITE_CREDIT_PACKS.length).toBeGreaterThan(0);

    expect(ADDONS).toContain("Additional active listing");
    expect(ADDONS).toContain("Listing boost");
    expect(ADDONS).toContain("Extra community announcement");
    expect(ADDONS).toContain("Invite credit packs");
  });

  /**
   * Presentation only. ADDITIONAL_LISTING_PRICING deliberately has no
   * unsubscribed rate — quoting one would sell a plan's allowance without the
   * plan — so eligibility is stated rather than discovered at checkout.
   */
  it("states eligibility and starts no purchase", () => {
    expect(ADDONS).toContain("paid plan");
    expect(code(ADDONS)).not.toContain("startHostCheckout");
    expect(code(ADDONS)).not.toContain("<form");
  });

  it("keeps the boost honest about what it does not buy", () => {
    expect(ADDONS).toContain("never changes a match score");
  });
});

describe("the early-host block is dark until it is configured", () => {
  it("has an unconfigured branch that renders no figure", () => {
    expect(SECTION).toContain('view.state === "unconfigured"');
    const dark = SECTION.slice(
      SECTION.indexOf('view.state === "unconfigured"'),
      SECTION.indexOf("const terminal"),
    );
    expect(dark).not.toContain("view.counts");
    expect(dark).not.toContain("deadlineIso");
    expect(dark).toContain("is coming");
  });

  it("gates every count and the deadline on the open state", () => {
    expect(SECTION).toContain('view.state === "open" && view.counts');
    expect(SECTION).toContain('view.state === "open" && view.deadlineIso');
  });

  it("renders the deadline as server text before it renders a countdown", () => {
    const deadlineAt = SECTION.indexOf("Enrolment closes on");
    const countdownAt = SECTION.indexOf("<FoundingCountdown");
    expect(deadlineAt).toBeGreaterThan(-1);
    expect(countdownAt).toBeGreaterThan(deadlineAt);
  });

  /**
   * The commonest form of this widget starts a timer from the visitor's clock
   * and resets on reload. That is a fabricated deadline, and it is the exact
   * dishonesty this phase exists to remove.
   */
  it("counts down to a server instant and stores nothing", () => {
    expect(code(COUNTDOWN)).not.toContain("localStorage");
    expect(code(COUNTDOWN)).not.toContain("sessionStorage");
    expect(code(COUNTDOWN)).not.toContain("setDefault");
    expect(COUNTDOWN).toContain("deadlineIso");
    // Nothing renders until the instant is in hand, and nothing renders once it
    // has passed — a countdown showing zero claims the offer is still open.
    expect(COUNTDOWN).toContain("if (!remaining) return null;");
  });

  it("renders the opt-in field only when a place is genuinely claimable", () => {
    expect(ACTIVATE).toContain("foundingOffered");
    expect(ACTIVATE).toContain("foundingView.claimable");
    expect(ACTIVATE).toContain("hasFoundingCheckoutConfig()");
    expect(ACTIVATE).toContain('name="founding"');
  });

  it("quotes the terms from the contract without adding to them", () => {
    expect(SECTION).toContain("FOUNDING_TERMS");
    expect(code(SECTION)).not.toContain("FOUNDING_SEAT_CAP");
  });
});
