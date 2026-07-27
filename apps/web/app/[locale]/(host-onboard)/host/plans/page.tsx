import type { Metadata } from "next";
import {
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
import { getFoundingHostProgram } from "@explore-and-earn/db";
import { Card } from "@explore-and-earn/ui";

import { FoundingHostSection } from "../../../../../components/founding/FoundingHostSection";
import { resolveFoundingProgramView } from "../../../../../components/founding/program";
import { formatMoney } from "../../../../../lib/format";
import {
  hasStripeCheckoutConfig,
  type HostSubscriptionTier,
} from "../../../../../services/stripe";
import {
  CaptureOnMount,
  FunnelLink,
} from "../../../../../components/analytics/FunnelEvents";
import { HOST_FUNNEL_EVENTS } from "../../../../../lib/analytics/events";
import styles from "./page.module.css";

/**
 * Plan selection for a host who does not have a host profile yet.
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
 * WHERE THAT LINK GOES, and why it is a single href rather than a fork. It
 * points at /host, and the (host) layout does the rest: that layout redirects a
 * profile-less user to /host/onboarding and renders the workspace for everyone
 * else. So one link already means "onboarding if you have no profile, your
 * workspace if you do" — and this page gets that for free without reading a host
 * profile, WHICH IT MUST NOT DO. host-acquisition-funnel.test.ts pins that by
 * scanning this file for the names of the host-profile readers, so naming one
 * here — even in a comment, even to say it is forbidden — fails the build. The
 * page has to render for someone who has no profile row at all.
 *
 * It sits in (host-onboard) for the same reason /host/onboarding does: that
 * group's layout gates on being SIGNED IN and nothing else.
 *
 * /host/billing keeps the same three plans plus the portal and refund surfaces
 * for hosts who are already through onboarding. Both post to the same action.
 *
 * D12 MOVED THE CHECKOUT POST ONE SCREEN LATER. This page used to submit
 * startHostCheckoutAction directly from each card, which meant the last thing a
 * host saw before Stripe was three prices and a button — no total, no renewal
 * amount, no cancellation terms, and no statement of what activating actually
 * turns on. Those facts now live on /host/plans/activate, which posts the same
 * action with the same fields. This page selects a tier and an interval; it
 * still reads no host profile, and every ?error= the action can raise still
 * lands here as a sentence.
 */
export const metadata: Metadata = { title: "Choose your plan" };
export const dynamic = "force-dynamic";

const HOST_PLAN_TIERS: HostSubscriptionTier[] = [
  "starter",
  "professional",
  "enterprise",
];

function titleCaseTier(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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
      return "You're already on a plan — carry on and create your host profile.";
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
      <section className={styles.shell}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>
          <h1 className={styles.title}>Choose your plan</h1>
          <p className={styles.subtitle}>
            Start with a plan, or build your profile first and activate when
            you&apos;re ready to publish.
          </p>
          <p className={styles.reassurance}>
            You can build and preview your employer profile before choosing a
            plan.
          </p>
          {/* The second door. Prominent, and placed where the decision is made
              rather than buried under three price cards — a host who wants to
              look before paying should not have to scroll past the ask to find
              out they are allowed to. */}
          <FunnelLink
            event={HOST_FUNNEL_EVENTS.browseFirstSelected}
            href="/host"
            className={styles.browseFirst}
          >
            I just want to browse first
          </FunnelLink>
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

        <div id="plans" className={styles.planGrid}>
          {HOST_PLAN_TIERS.map((tier) => {
            const pricing = FOUNDER_LOCKED_PRICING[tier];
            const entitlements = PLAN_ENTITLEMENTS[tier];

            return (
              <Card key={tier} title={titleCaseTier(tier)}>
                <div className={styles.pricingBlock}>
                  <div className={styles.pricePair}>
                    <strong>{formatMoney(pricing.monthly)}</strong>
                    <span>monthly</span>
                  </div>
                  <div className={styles.pricePair}>
                    <strong>{formatMoney(pricing.yearly)}</strong>
                    <span>annual · {ANNUAL_MONTHS_BILLED} months billed</span>
                  </div>
                </div>

                <ul className={styles.entitlements}>
                  <li>{entitlements.listings} active listing slots</li>
                  <li>
                    {entitlements.includedInviteCredits} included invite credits /
                    month
                  </li>
                  <li>{entitlements.monthlyAnnouncements} monthly announcements</li>
                  {/* Listed only when the plan actually grants seats, so a tier
                      with none says nothing rather than advertising "0". */}
                  {entitlements.teamSeats > 0 ? (
                    <li>{entitlements.teamSeats} team seats</li>
                  ) : null}
                  <li>{entitlements.analytics} analytics access</li>
                </ul>

                <div className={styles.actionGroup}>
                  {/* Both actions carry the choice to the activation summary,
                      which states the exact amount due today, what renews and
                      when, what activates the moment the payment lands, and how
                      to cancel — and posts the same checkout action from there.
                      The funnel event still fires on this click, because this is
                      where the host chose. */}
                  {checkoutConfigured ? (
                    <>
                      <FunnelLink
                        event={HOST_FUNNEL_EVENTS.checkoutStarted}
                        properties={{ tier, interval: "monthly" }}
                        href={`/host/plans/activate?tier=${tier}&interval=monthly`}
                        className={styles.primaryButton}
                      >
                        Continue monthly
                      </FunnelLink>
                      <FunnelLink
                        event={HOST_FUNNEL_EVENTS.checkoutStarted}
                        properties={{ tier, interval: "yearly" }}
                        href={`/host/plans/activate?tier=${tier}&interval=yearly`}
                        className={styles.secondaryButton}
                      >
                        Continue annual
                      </FunnelLink>
                    </>
                  ) : (
                    <p className={styles.unavailable}>
                      Checkout isn&apos;t available on this environment yet.
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* The early-host programme, in whatever state it is genuinely in. Its
            call to action points BACK at the cards above rather than forward:
            the discount is not a separate product, it is the same three plans at
            a different rate, applied on the activation summary when the row says
            a place is claimable. */}
        <FoundingHostSection view={foundingView} ctaHref="#plans" />
      </section>
    </main>
  );
}
