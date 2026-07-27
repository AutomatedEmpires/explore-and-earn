/**
 * THE PRE-BILLING HOST MODE (commercial redesign D6/D7/D15).
 *
 * The founder's rule in one line: build first, pay to publish. This file pins
 * the application half of it.
 *
 * WHAT IS AND IS NOT ASSERTED HERE, stated because the mix looks inconsistent
 * until you know why. `apps/web` sets `jsx: "preserve"`, so vitest cannot
 * transform a `.tsx` and no component in this repository can be RENDERED in a
 * unit test — the same constraint that put listingStatusTransitions.ts in a
 * plain `.ts` module in the first place. So:
 *
 *   * behaviour that can live in a pure module does, and is tested by calling it
 *     (transitionRequiresActivePlan below);
 *   * the rest is asserted against component SOURCE, which is weaker and is
 *     labelled as such. A source assertion proves the copy and the wiring exist;
 *     it cannot prove they render.
 *
 * NONE OF IT IS THE GATE. The refusal a prospect actually meets is the
 * database's, and it is proved against a real database in
 * packages/db/tests/entitlementEnforcementIntegration.test.ts and
 * tools/db-assert/sql/assert_profile_onboarding.sql. Everything here is the
 * courtesy layer in front of that refusal.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  hostListingTransitions,
  transitionRequiresActivePlan,
} from "../../components/host/listingStatusTransitions";

const componentSource = (name: string): string =>
  readFileSync(new URL(`../../components/host/${name}`, import.meta.url), "utf8");

// ── The gating rule, as behaviour ──────────────────────────────────────────

describe("transitionRequiresActivePlan", () => {
  /**
   * The refusal lands one step EARLIER than "publish", and that is the assertion
   * most likely to be got wrong by someone simplifying this later. The allowance
   * counts under_review, so a prospect is stopped at "Mark ready to publish".
   */
  it("gates the draft -> under_review edge, not just publication", () => {
    expect(transitionRequiresActivePlan("draft", "under_review")).toBe(true);
    expect(transitionRequiresActivePlan("under_review", "live")).toBe(true);
    expect(transitionRequiresActivePlan("paused", "live")).toBe(true);
  });

  /**
   * Reducing your own footprint is never gated. A host who cannot publish must
   * still be able to pause and archive what they have, or the refusal traps them.
   */
  it("never gates a route OUT of a counted status", () => {
    expect(transitionRequiresActivePlan("live", "paused")).toBe(false);
    expect(transitionRequiresActivePlan("live", "archived")).toBe(false);
    expect(transitionRequiresActivePlan("paused", "archived")).toBe(false);
    expect(transitionRequiresActivePlan("under_review", "draft")).toBe(false);
  });

  it("never gates a move into an uncounted status", () => {
    expect(transitionRequiresActivePlan("closed", "draft")).toBe(false);
    expect(transitionRequiresActivePlan("draft", "draft")).toBe(false);
  });

  /**
   * Mirrors the trigger's exemption: a move between two already-counted statuses
   * consumes no new slot. It stops short of entering 'live' because that edge is
   * how an over-allowance host would otherwise pause and resume forever.
   */
  it("exempts counted-to-counted moves except the ones entering live", () => {
    expect(transitionRequiresActivePlan("under_review", "paused")).toBe(false);
    expect(transitionRequiresActivePlan("paused", "under_review")).toBe(false);
    expect(transitionRequiresActivePlan("paused", "live")).toBe(true);
  });

  /**
   * The rule has to cover every button the controls can actually draw, or a
   * prospect finds one that falls through to a raw database error. Enumerated
   * from the transition table rather than by hand, so a new button is covered
   * the day it is added.
   */
  it("has an answer for every transition the host UI offers", () => {
    const statuses = [
      "draft",
      "under_review",
      "live",
      "paused",
      "closed",
      "archived",
    ] as const;
    for (const status of statuses) {
      for (const transition of hostListingTransitions(status)) {
        expect(typeof transitionRequiresActivePlan(status, transition.target)).toBe(
          "boolean",
        );
      }
    }
    // And the specific one that matters: every "publish" button is gated.
    expect(
      hostListingTransitions("under_review").some(
        (t) => t.target === "live" && transitionRequiresActivePlan("under_review", t.target),
      ),
    ).toBe(true);
  });
});

// ── The activation banner ──────────────────────────────────────────────────

describe("the prospect activation banner", () => {
  const banner = () => componentSource("HostActivationBanner.tsx");

  it("renders for prospect accounts and no others", () => {
    const source = banner();
    expect(source).toContain('accountState !== "prospect"');
    // A lapsed host has a subscription in trouble, not an absent one — the
    // billing surfaces already speak to them.
    expect(source).not.toContain('accountState === "lapsed"');
  });

  it("carries the founder's activation sentence verbatim", () => {
    expect(banner()).toContain(
      "Your workspace is ready. Activate a plan when you want to publish and",
    );
  });

  it("offers exactly one call to action, to the plans page", () => {
    const source = banner();
    expect(source).toContain('href="/host/plans"');
    expect(source.match(/href=/g) ?? []).toHaveLength(1);
  });

  /**
   * NON-HOSTILE IS A REQUIREMENT, not a preference: the conversion principle is
   * that the host builds and understands the product before billing becomes the
   * gate, and a banner that traps or nags defeats it. Dismissible, returning
   * next session, never a modal.
   */
  it("is dismissible per session and is not a modal", () => {
    const source = banner();
    expect(source).toContain("sessionStorage");
    expect(source).not.toContain("localStorage");
    expect(source).toContain("<aside");
    expect(source).not.toContain("role=\"dialog\"");
    expect(source).not.toContain("Modal");
  });

  it("is mounted by the host shell, so every host page carries it", () => {
    const shell = componentSource("HostShell.tsx");
    expect(shell).toContain("<HostActivationBanner accountState={accountState} />");
    // The prop was declared and silently dropped before this change.
    expect(shell).toContain("accountState,");
  });
});

// ── Publish-gating copy ────────────────────────────────────────────────────

describe("the publish control for a prospect", () => {
  const controls = () => componentSource("ListingStatusControls.tsx");

  it("shows the activation sentence instead of a raw database error", () => {
    const source = controls();
    expect(source).toContain("Publishing requires an active plan — your draft is saved.");
    expect(source).toContain('href="/host/plans"');
  });

  it("routes the gated click to the explanation rather than the action", () => {
    const source = controls();
    expect(source).toContain("transitionRequiresActivePlan(currentStatus, transition.target)");
    expect(source).toContain("explainPlanRequirement(transition.target)");
  });

  /**
   * The button stays ENABLED. A disabled control reads as "this is broken" and
   * leaves the host nowhere to go; a live one that explains itself names the
   * price and the next step.
   */
  it("does not disable the button, and gates only on an explicit prospect", () => {
    const source = controls();
    expect(source).toContain('accountState === "prospect"');
    // Undefined must gate nothing — a wrongly withheld publish button on a
    // paying host is worse than a missing explanation.
    expect(source).not.toContain("disabled={isPending || gated}");
  });
});

// ── The server refusal is untouched (the UI is a courtesy) ─────────────────

describe("the server path a prospect cannot talk their way past", () => {
  const listingsAction = readFileSync(
    new URL("../../app/actions/listings.ts", import.meta.url),
    "utf8",
  );
  const lifecycle = readFileSync(
    new URL("../../../../packages/db/src/queries/listingLifecycle.ts", import.meta.url),
    "utf8",
  );

  /**
   * THE POINT OF THE WHOLE ARRANGEMENT. The UI courtesy above must not have
   * become the enforcement: updateListingStatusAction takes no account state, is
   * not told whether the caller is a prospect, and refuses on what the database
   * says. Calling it directly — which any client can — meets the same refusal.
   */
  it("takes no account-state parameter and consults none", () => {
    const action = listingsAction.slice(
      listingsAction.indexOf("export async function updateListingStatusAction"),
      listingsAction.indexOf("export async function pauseListingAction"),
    );
    expect(action.length).toBeGreaterThan(0);
    expect(action).not.toContain("accountState");
    expect(action).not.toContain("hostAccountState");
    expect(action).not.toContain("transitionRequiresActivePlan");
  });

  it("still refuses an over-allowance transition, and says which refusal it is", () => {
    expect(listingsAction).toContain('result.error === "listing_plan_required"');
    expect(listingsAction).toContain('result.error === "listing_cap_reached"');
    expect(lifecycle).toContain('"listing_plan_required"');
    expect(lifecycle).toContain('"listing_cap_reached"');
    expect(lifecycle).toContain("hasListingCapacity(allowance.used, allowance.allowance)");
    // The split is decided from the tier the SAME rpc payload carries, so the
    // two sentences cannot drift from the allowance they explain.
    expect(lifecycle).toContain("isPaidPlanTier(allowance.tier)");
  });

  /**
   * The copy the prospect gets must not tell them to do something impossible.
   * "Pause or close another listing" was the only sentence available before D6,
   * and a prospect has no other listing to pause and no plan to upgrade.
   */
  it("does not tell a planless host to pause a listing they do not have", () => {
    const planArm = listingsAction.slice(
      listingsAction.indexOf('result.error === "listing_plan_required"'),
      listingsAction.indexOf('result.error === "listing_cap_reached"'),
    );
    expect(planArm).toContain("Publishing requires an active plan");
    expect(planArm).not.toContain("Pause or close another listing");
  });
});

// ── D15 funnel events ──────────────────────────────────────────────────────

describe("funnel instrumentation (D15)", () => {
  const events = readFileSync(
    new URL("../../lib/analytics/events.ts", import.meta.url),
    "utf8",
  );
  const capture = readFileSync(
    new URL("../../lib/analytics/capture.ts", import.meta.url),
    "utf8",
  );

  it("declares the six pre-billing funnel events, snake_case", () => {
    for (const name of [
      "host_plans_viewed",
      "host_browse_first_selected",
      "host_profile_created",
      "host_listing_draft_started",
      "host_activation_banner_clicked",
      "host_checkout_started",
    ]) {
      expect(events).toContain(`"${name}"`);
    }
  });

  /**
   * Analytics may never break a user action, and every one of these sites is on
   * a path a host is actively using. Swallowed failures and a dynamic import are
   * both load-bearing — the latter because a static one welds the SDK into every
   * route's first load, which CookieBanner already documents.
   */
  it("captures without throwing, blocking, or bundling the SDK statically", () => {
    expect(capture).toContain('void import("posthog-js")');
    expect(capture).toContain(".catch(()");
    expect(capture).not.toMatch(/^import posthog from "posthog-js"/m);
    expect(capture).toContain("if (!posthogConfig) return;");
  });

  it("carries no personal data in the event properties", () => {
    // The property type is narrowed to primitives on purpose; an object would
    // let a whole profile through by accident.
    expect(capture).toContain("Record<string, string | number | boolean | null>");

    // COMMENTS ARE STRIPPED FIRST, and the first draft of this assertion did not
    // do that — so it failed on a header sentence promising that no raw email is
    // captured. A negative assertion that reads prose is testing the prose.
    const code = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");

    for (const forbidden of ["email", "companyName", "clerkUserId", "userId"]) {
      expect(code(events), `events must not capture ${forbidden}`).not.toContain(
        forbidden,
      );
      expect(code(capture), `capture must not read ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});
