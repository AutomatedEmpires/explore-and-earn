import type { Metadata } from "next";
import {
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
import { Card } from "@explore-and-earn/ui";

import { formatMoney } from "../../../../../lib/format";
import { startHostCheckoutAction } from "../../../../actions/hostBilling";
import {
  hasStripeCheckoutConfig,
  type HostSubscriptionTier,
} from "../../../../../services/stripe";
import {
  CaptureOnMount,
  FunnelLink,
  FunnelSubmitButton,
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

        <div className={styles.planGrid}>
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
                  {/* Still a plain form posting to the server action — the
                      button only adds the funnel event on click and takes no
                      part in submission. */}
                  <form action={startHostCheckoutAction}>
                    <input type="hidden" name="tier" value={tier} />
                    <input type="hidden" name="interval" value="monthly" />
                    <FunnelSubmitButton
                      event={HOST_FUNNEL_EVENTS.checkoutStarted}
                      properties={{ tier, interval: "monthly" }}
                      className={styles.primaryButton}
                      disabled={!checkoutConfigured}
                    >
                      Start monthly
                    </FunnelSubmitButton>
                  </form>
                  <form action={startHostCheckoutAction}>
                    <input type="hidden" name="tier" value={tier} />
                    <input type="hidden" name="interval" value="yearly" />
                    <FunnelSubmitButton
                      event={HOST_FUNNEL_EVENTS.checkoutStarted}
                      properties={{ tier, interval: "yearly" }}
                      className={styles.secondaryButton}
                      disabled={!checkoutConfigured}
                    >
                      Start annual
                    </FunnelSubmitButton>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
