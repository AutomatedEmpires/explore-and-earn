import type { Metadata } from "next";
import { getFoundingHostProgram } from "@explore-and-earn/db";

import { FoundingHostSection } from "../../../../../components/founding/FoundingHostSection";
import { resolveFoundingProgramView } from "../../../../../components/founding/program";
import { AddOnTable } from "../../../../../components/pricing/AddOnTable";
import { BillingTermsSummary } from "../../../../../components/pricing/BillingTermsSummary";
import { CommercialPreviews } from "../../../../../components/pricing/CommercialPreviews";
import { PlanComparisonMatrix } from "../../../../../components/pricing/PlanComparisonMatrix";
import { hasStripeCheckoutConfig } from "../../../../../services/stripe";
import {
  CaptureOnMount,
  FunnelLink,
} from "../../../../../components/analytics/FunnelEvents";
import { HOST_FUNNEL_EVENTS } from "../../../../../lib/analytics/events";
import styles from "./page.module.css";

/**
 * The commercial decision surface (spec V2 D21).
 *
 * THIS PAGE EXISTS BECAUSE THE FUNNEL WAS A CLOSED LOOP. Migration 083 gated
 * create_my_host_profile on an active paid tier, so a new host had to pay BEFORE
 * they had a profile — and every plan surface lived under the (host) route
 * group, whose layout redirects any profile-less user to /host/onboarding, which
 * told them to choose a plan first. Choose a plan -> onboarding -> choose a plan.
 *
 * COMMERCIAL REDESIGN D6/D7 CHANGED WHAT THIS PAGE IS. Migration 086 removed
 * that creation gate, so this is no longer a tollgate a host must pass to exist.
 * It is a choice, offered alongside the other one: build first, activate when
 * there is something to publish. The "I just want to browse first" action below
 * is that second door, and it is deliberately prominent — a secondary action
 * nobody can find is a dark pattern with extra steps.
 *
 * ── WHAT V2 CHANGED, AND WHY ────────────────────────────────────────────────
 * The founder rejected the V1 presentation: three price cards and a button. The
 * problem was not the design, it was the ORDER OF THE ARGUMENT. A host was shown
 * what three plans cost before being shown anything the plans do, could not diff
 * the tiers without holding three lists in their head, and had no answer to the
 * two questions that actually stop a purchase — is there a minimum term, and
 * what happens to my work if I stop paying.
 *
 * So the page is now one sequence, and each section answers the question the
 * previous one raises:
 *
 *   1. previews   — what the thing looks like, in production components
 *   2. matrix     — what changes between tiers, derived from PLAN_ENTITLEMENTS
 *   3. add-ons    — what sits on top, from the founder-locked contract
 *   4. founding   — the early-host rate, in whatever state it is genuinely in
 *   5. terms      — renewal, cancellation, and what activation turns on
 *
 * The bare three-card block is gone. Nothing was deleted from it: every figure
 * it rendered now appears in the matrix, sourced from the same contract.
 *
 * ── WHERE THE BROWSE-FIRST LINK GOES, and why it is a single href rather than
 * a fork. It points at /host, and the (host) layout does the rest: that layout
 * redirects a profile-less user to /host/onboarding and renders the workspace
 * for everyone else. So one link already means "onboarding if you have no
 * profile, your workspace if you do" — and this page gets that for free without
 * reading a host profile, WHICH IT MUST NOT DO. host-acquisition-funnel.test.ts
 * pins that by scanning this file for the names of the host-profile readers, so
 * naming one here — even in a comment, even to say it is forbidden — fails the
 * build. The page has to render for someone who has no profile row at all. That
 * constraint is also why every preview above is fed from demo fixtures.
 *
 * It sits in (host-onboard) for the same reason /host/onboarding does: that
 * group's layout gates on being SIGNED IN and nothing else.
 *
 * /host/billing keeps the subscription and account-value surfaces for hosts who
 * are already through onboarding; under D21 it is never a second plans page.
 *
 * D12 MOVED THE CHECKOUT POST ONE SCREEN LATER. This page used to submit the
 * checkout action directly from each card, which meant the last thing a host saw
 * before Stripe was three prices and a button — no total, no renewal amount, no
 * cancellation terms, and no statement of what activating actually turns on.
 * Those facts now live on /host/plans/activate, which posts the same action with
 * the same fields. This page selects a tier and an interval and LINKS there
 * rather than restating it; every ?error= the action can raise still lands here
 * as a sentence.
 */
export const metadata: Metadata = { title: "Choose your plan" };
export const dynamic = "force-dynamic";

type PlansSearchParams = { error?: string };

function resolveFeedback(searchParams: PlansSearchParams): string | null {
  switch (searchParams.error) {
    case "invalid_plan":
    case "invalid_interval":
      return "That plan wasn't recognised. Pick one below and try again.";
    case "unauthenticated":
    case "expired_session":
      return "Please sign in again, then choose your plan.";
    case "already_subscribed":
      return "You're already on a plan — carry on and build your employer profile.";
    // The guard found a live Stripe subscription in a recoverable lapse
    // (paused / unpaid / past due). A second checkout would stack a second
    // subscription the moment the first collects again, so the way back is
    // the billing portal, not a new purchase.
    case "subscription_lapsed_use_portal":
      return "Your existing subscription has a payment issue rather than being over. Settle it from Manage billing on your billing page — starting a new plan here would risk billing you twice.";
    case "rate_limited":
      return "You've started several checkouts just now. Give it a few minutes.";
    // The early-host rate was requested but the programme is not open, the last
    // place went while the tab was open, or the discounted prices are not
    // provisioned on this environment. Checkout is REFUSED rather than quietly
    // reopened at the standard rate — being shown one price and charged another
    // is the one outcome that is never acceptable here.
    case "founding_unavailable":
      return "The early-host rate isn't available right now, so nothing was started and nothing was charged. The standard plans below are unchanged.";
    // The already-subscribed guard could not read your billing record, so
    // checkout was refused rather than risk starting a second subscription
    // alongside one you may already have.
    case "subscription_check_unavailable":
      return "We couldn't confirm your current plan just now, so we didn't start checkout. Try again shortly — nothing was charged.";
    case "checkout_failed":
    case "missing_checkout_url":
      return "Checkout could not be started. Please try again in a moment.";
    // Stripe's cancel_url — the host backed out of checkout themselves.
    case "checkout_canceled":
      return "Checkout was canceled and nothing was charged. Pick a plan whenever you're ready.";
    default:
      return null;
  }
}

export default async function HostPlansPage({
  searchParams,
}: {
  searchParams: Promise<PlansSearchParams>;
}) {
  const params = await searchParams;
  const feedback = resolveFeedback(params);
  const checkoutConfigured = hasStripeCheckoutConfig();
  // Reads the programme row, NOT a host profile — the topology test forbids the
  // latter and this page must still render for someone with no profile at all.
  // Unconfigured (the shipped state), a read fault, or a draft row all resolve
  // to the view that shows one qualitative sentence and no figure.
  const foundingView = resolveFoundingProgramView(await getFoundingHostProgram());

  return (
    <main className={styles.page}>
      <CaptureOnMount event={HOST_FUNNEL_EVENTS.plansViewed} />
      <div className={styles.shell}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>
          <h1 className={styles.title}>Choose your plan</h1>
          <p className={styles.subtitle}>
            Start with a plan, or build your profile first and activate when
            you&apos;re ready to publish.
          </p>

          {/* The second door. Prominent, and placed where the decision is made
              rather than buried under the prices — a host who wants to look
              before paying should not have to scroll past the ask to find out
              they are allowed to. */}
          <div className={styles.browseFirstBlock}>
            <p className={styles.reassurance}>
              You can build and preview your employer profile before choosing a
              plan.
            </p>
            <FunnelLink
              event={HOST_FUNNEL_EVENTS.browseFirstSelected}
              href="/host"
              className={styles.browseFirst}
            >
              I just want to browse first
            </FunnelLink>
            <p className={styles.browseFirstNote}>
              Everything you have entered so far is kept. Nothing here expires,
              and coming back later costs you no progress.
            </p>
          </div>
        </header>

        {feedback ? (
          <p role="alert" className={styles.feedback}>
            {feedback}
          </p>
        ) : null}

        {!checkoutConfigured ? (
          <p role="status" className={styles.feedback}>
            Checkout isn&apos;t available on this environment yet.
          </p>
        ) : null}

        {/* 1. What the thing looks like, before what it costs. */}
        <CommercialPreviews />

        {/* 2. What changes between tiers. Replaces the three-card block. */}
        <PlanComparisonMatrix checkoutConfigured={checkoutConfigured} />

        {/* 3. What sits on top of a plan, from the founder-locked contract. */}
        <AddOnTable />

        {/* 4. The early-host programme, in whatever state it is genuinely in.
            Its call to action points BACK at the matrix rather than forward: the
            discount is not a separate product, it is the same three plans at a
            different rate, applied on the activation summary when the row says a
            place is claimable. */}
        <FoundingHostSection view={foundingView} ctaHref="#plans" />

        {/* 5. Renewal, cancellation, and what activation turns on. */}
        <BillingTermsSummary />
      </div>
    </main>
  );
}
