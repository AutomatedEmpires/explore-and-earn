import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
import { getFoundingHostProgram } from "@explore-and-earn/db";

import { CaptureOnMount } from "../../../../../../components/analytics/CaptureOnMount";
import { FoundingHostSection } from "../../../../../../components/founding/FoundingHostSection";
import {
  foundingRateCents,
  resolveFoundingProgramView,
} from "../../../../../../components/founding/program";
import { AddOnTable } from "../../../../../../components/pricing/AddOnTable";
import { HOST_FUNNEL_EVENTS } from "../../../../../../lib/analytics";
import { formatMoney } from "../../../../../../lib/format";
import { startHostCheckoutAction } from "../../../../../actions/hostBilling";
import {
  hasFoundingCheckoutConfig,
  hasStripeCheckoutConfig,
  isBillingInterval,
  isHostSubscriptionTier,
  type BillingInterval,
  type HostSubscriptionTier,
} from "../../../../../../services/stripe";
import styles from "./page.module.css";

/**
 * The activation summary (commercial redesign D12).
 *
 * WHAT THIS PAGE IS FOR. Before it existed, the last screen a host saw on this
 * side of Stripe was three price cards and a button. Everything that decides
 * whether a purchase is a good idea — the exact amount leaving the account
 * today, what renews and when, what the plan actually turns on, and how to stop
 * — was somewhere else or nowhere. A price a buyer cannot explain back to you is
 * not a price they agreed to.
 *
 * So: one screen, everything stated, and the two doors that were always meant to
 * be here — activate, or carry on building. The escape hatch is not a courtesy;
 * it is the whole conversion principle (D6/D7), and a host who wants to keep
 * looking must be able to leave this page without feeling they have lost their
 * place.
 *
 * WHAT IT MUST NOT DO, in three parts:
 *
 *   * NO SEAT CLAIMS (D13). Accepting a team invitation grants no access to any
 *     listing, applicant, conversation or analytic, so no surface may sell one.
 *     The entitlement figure is zero and this page renders nothing about it —
 *     not even "0 seats", which reads as a limit rather than as an absence.
 *   * NO PRICE OF ITS OWN. Every amount comes from FOUNDER_LOCKED_PRICING or,
 *     for the early-host rate, from the founding contract via the program
 *     module. The pricing guardrail enforces this; the reason for it is that a
 *     summary quoting a different number from the one Stripe charges is worse
 *     than no summary.
 *   * NO SCARCITY IT CANNOT EVIDENCE. The early-host block appears only when the
 *     database says a programme is open with a seat left; the opt-in field is
 *     rendered only then, and the server action re-checks it anyway.
 *
 * It sits in (host-onboard) for the same reason /host/plans does: that group
 * gates on being SIGNED IN and nothing else, and the whole audience for this
 * page is people who may not have a host profile yet. It reads no host profile,
 * deliberately.
 */
export const metadata: Metadata = {
  title: "Review and activate",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface ActivateSearchParams {
  tier?: string;
  interval?: string;
}

function titleCaseTier(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * What the plan turns on, DERIVED from PLAN_ENTITLEMENTS.
 *
 * The colleague-seat entitlement is deliberately absent: see the header. A
 * figure of zero is not rendered as a limit, because there is no capability
 * behind it to limit.
 */
function planCapabilities(tier: HostSubscriptionTier): readonly string[] {
  const entitlement = PLAN_ENTITLEMENTS[tier];
  const capabilities = [
    `${entitlement.listings} active ${
      entitlement.listings === 1 ? "listing" : "listings"
    } — published, discoverable in Seek, Swipe and Map, and able to receive applications`,
    `${entitlement.includedInviteCredits} invite credits a month, for sourcing candidates directly`,
    entitlement.analytics === "full"
      ? "Full analytics, including the per-listing breakdown of applications and invites"
      : "Account-wide analytics: applications by stage, listing counts, invite acceptance",
    "Messaging on every application, attached to the applicant it belongs to",
  ];
  if (entitlement.monthlyAnnouncements > 0) {
    capabilities.push(
      `${entitlement.monthlyAnnouncements} community ${
        entitlement.monthlyAnnouncements === 1 ? "announcement" : "announcements"
      } a month, reaching seekers who have not found your roles yet`,
    );
  }
  capabilities.push(
    "Eligibility for every add-on below — extra listings, boosts, extra announcement runs and invite credit packs",
  );
  return capabilities;
}

const AFTER_PAYMENT: readonly string[] = [
  "Your drafts become publishable immediately — nothing is queued for approval.",
  "Published roles appear in Seek, Swipe and Map, and start receiving applications.",
  "Applicants arrive with a match score, in a pipeline with stages.",
  "Messaging opens on each application, and your analytics start filling.",
];

export default async function HostPlanActivatePage({
  searchParams,
}: {
  searchParams: Promise<ActivateSearchParams>;
}) {
  const params = await searchParams;
  const tier = params.tier;
  const interval = params.interval;

  // An unrecognised selection goes back to the chooser with the message that
  // page already renders, rather than being guessed at here. Guessing a tier is
  // guessing an amount.
  if (typeof tier !== "string" || !isHostSubscriptionTier(tier)) {
    redirect("/host/plans?error=invalid_plan");
  }
  if (typeof interval !== "string" || !isBillingInterval(interval)) {
    redirect("/host/plans?error=invalid_interval");
  }

  const selectedTier: HostSubscriptionTier = tier;
  const selectedInterval: BillingInterval = interval;
  const checkoutConfigured = hasStripeCheckoutConfig();

  const standardCents = FOUNDER_LOCKED_PRICING[selectedTier][selectedInterval];
  const monthlyCents = FOUNDER_LOCKED_PRICING[selectedTier].monthly;

  // The early-host programme, read from the database. Null (no row, a read
  // fault, or a draft) resolves to the unconfigured view, which offers nothing
  // and renders no figure.
  const foundingView = resolveFoundingProgramView(await getFoundingHostProgram());
  const foundingOffered =
    foundingView.claimable && checkoutConfigured && hasFoundingCheckoutConfig();
  const foundingCents = foundingRateCents(selectedTier, selectedInterval);

  const cadence =
    selectedInterval === "yearly" ? "every 12 months" : "every month";

  return (
    <main className={styles.page}>
      <CaptureOnMount
        event={HOST_FUNNEL_EVENTS.hostActivationPageViewed}
        properties={{ tier: selectedTier, interval: selectedInterval }}
      />

      <div className={styles.shell}>
        <header className={styles.head}>
          <Link className={styles.back} href="/host/plans">
            Back to plans
          </Link>
          <h1 className={styles.title}>
            Activate {titleCaseTier(selectedTier)}
          </h1>
          <p className={styles.subtitle}>
            Everything this turns on, what it costs, and how to stop — before you
            pay for any of it.
          </p>
        </header>

        <div className={styles.columns}>
          {/* ── Left: what activates, and on what terms ──────────────── */}
          <div className={styles.detail}>
            <section
              className={styles.block}
              aria-labelledby="activates-title"
            >
              <h2 id="activates-title" className={styles.blockTitle}>
                What activates the moment you pay
              </h2>
              <ul className={styles.capabilities}>
                {planCapabilities(selectedTier).map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </section>

            <section className={styles.block} aria-labelledby="terms-title">
              <h2 id="terms-title" className={styles.blockTitle}>
                Billing terms
              </h2>
              <dl className={styles.terms}>
                <div className={styles.termRow}>
                  <dt>Due today</dt>
                  <dd>
                    {formatMoney(foundingOffered ? foundingCents : standardCents)}
                  </dd>
                </div>
                <div className={styles.termRow}>
                  <dt>Renews</dt>
                  <dd>
                    {formatMoney(foundingOffered ? foundingCents : standardCents)}{" "}
                    {cadence}, until you cancel
                  </dd>
                </div>
                {selectedInterval === "yearly" ? (
                  <div className={styles.termRow}>
                    <dt>Why annual costs less</dt>
                    <dd>
                      Annual billing is {ANNUAL_MONTHS_BILLED} monthly payments
                      taken once a year — two months free against{" "}
                      {formatMoney(monthlyCents)} a month. There is no minimum
                      term.
                    </dd>
                  </div>
                ) : null}
                <div className={styles.termRow}>
                  <dt>Cancelling</dt>
                  <dd>
                    Cancel at any time from your billing settings. Your plan runs
                    to the end of the period you have paid for; after that your
                    listings stop being discoverable and your workspace returns to
                    the build-and-draft state, with nothing deleted. Refunds are
                    reviewed against the actual charge —{" "}
                    <Link className={styles.inlineLink} href="/refunds">
                      how refunds work
                    </Link>
                    .
                  </dd>
                </div>
                <div className={styles.termRow}>
                  <dt>Payment</dt>
                  <dd>
                    Taken by Stripe on their own checkout page. Card details are
                    entered there and never reach Explore &amp; Earn.
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.block} aria-labelledby="after-title">
              <h2 id="after-title" className={styles.blockTitle}>
                What happens immediately after payment
              </h2>
              <ol className={styles.afterList}>
                {AFTER_PAYMENT.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          </div>

          {/* ── Right: the total and the two doors ───────────────────── */}
          <aside className={styles.checkout} aria-labelledby="total-title">
            <div className={styles.totalCard}>
              <h2 id="total-title" className={styles.totalLabel}>
                {titleCaseTier(selectedTier)} ·{" "}
                {selectedInterval === "yearly" ? "annual" : "monthly"}
              </h2>

              {foundingOffered ? (
                <>
                  <p className={styles.totalWas}>
                    <s>{formatMoney(standardCents)}</s> standard
                  </p>
                  <p className={styles.total}>{formatMoney(foundingCents)}</p>
                  <p className={styles.totalNote}>
                    at the early-host rate, {cadence}
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.total}>{formatMoney(standardCents)}</p>
                  <p className={styles.totalNote}>{cadence}</p>
                </>
              )}

              {checkoutConfigured ? (
                <form action={startHostCheckoutAction} className={styles.form}>
                  <input type="hidden" name="tier" value={selectedTier} />
                  <input type="hidden" name="interval" value={selectedInterval} />
                  {/* Rendered ONLY when the database says a seat is genuinely
                      claimable and the discounted prices are provisioned. The
                      server action re-reads the same row regardless — a form
                      field is whatever the sender says it is. */}
                  {foundingOffered ? (
                    <input type="hidden" name="founding" value="1" />
                  ) : null}
                  <button type="submit" className={styles.primaryButton}>
                    Continue to secure payment
                  </button>
                </form>
              ) : (
                <p role="status" className={styles.unavailable}>
                  Checkout isn&apos;t available on this environment yet.
                </p>
              )}

              {/* The second door, and it is not decorative. A host who wants to
                  keep building must be able to leave without losing anything. */}
              <Link className={styles.secondaryLink} href="/host">
                Continue building my profile
              </Link>

              <p className={styles.reassurance}>
                Nothing is charged until you complete payment on Stripe&apos;s
                page, and your drafts are already saved.
              </p>
            </div>
          </aside>
        </div>

        {/* The early-host programme, in whatever state it is genuinely in.
            Renders one qualitative sentence when nothing is configured. */}
        <FoundingHostSection view={foundingView} ctaHref="/host/plans" />

        <AddOnTable headingLevel="h2" />
      </div>
    </main>
  );
}
