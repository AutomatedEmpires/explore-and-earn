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
import styles from "./page.module.css";

/**
 * Plan selection for a host who does not have a host profile yet.
 *
 * THIS PAGE EXISTS BECAUSE THE FUNNEL WAS A CLOSED LOOP. Migration 083 gates
 * create_my_host_profile on an active paid tier (founder: "no host can create a
 * profile or publish for free"), so a new host must pay BEFORE they have a
 * profile. Every plan surface lived under the (host) route group, whose layout
 * redirects any profile-less user to /host/onboarding — and onboarding told them
 * to choose a plan first. Choose a plan -> onboarding -> choose a plan.
 *
 * It sits in (host-onboard) for the same reason /host/onboarding does: that
 * group's layout gates on being SIGNED IN and nothing else, so it can be reached
 * with no host_profiles row. Nothing on this page reads one.
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
      <section className={styles.shell}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Explore &amp; Earn · For hosts</p>
          <h1 className={styles.title}>Choose your plan</h1>
          <p className={styles.subtitle}>
            Every host is on one of these three plans. Pick one to continue —
            you&apos;ll set up your host profile straight after checkout.
          </p>
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
                  <form action={startHostCheckoutAction}>
                    <input type="hidden" name="tier" value={tier} />
                    <input type="hidden" name="interval" value="monthly" />
                    <button
                      className={styles.primaryButton}
                      type="submit"
                      disabled={!checkoutConfigured}
                    >
                      Start monthly
                    </button>
                  </form>
                  <form action={startHostCheckoutAction}>
                    <input type="hidden" name="tier" value={tier} />
                    <input type="hidden" name="interval" value="yearly" />
                    <button
                      className={styles.secondaryButton}
                      type="submit"
                      disabled={!checkoutConfigured}
                    >
                      Start annual
                    </button>
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
