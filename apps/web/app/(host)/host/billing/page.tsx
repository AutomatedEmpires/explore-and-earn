import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import {
  ANNUAL_MONTHS_BILLED,
  FOUNDER_LOCKED_PRICING,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
import { Card } from "@explore-and-earn/ui";
import {
  getHostProfile,
  getHostRefundRequests,
  getHostSubscriptionTier,
} from "@explore-and-earn/db";

import {
  startHostBillingPortalAction,
  startHostCheckoutAction,
} from "../../../actions/hostBilling";
import {
  HostRefundPanel,
  type HostRefundRequestView,
} from "../../../../components/host/HostRefundPanel";
import {
  hasStripeCheckoutConfig,
  type HostSubscriptionTier,
} from "../../../../services/stripe";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

type BillingSearchParams = {
  checkout?: string;
  error?: string;
};

const HOST_PLAN_TIERS: HostSubscriptionTier[] = [
  "starter",
  "professional",
  "enterprise",
];

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function titleCaseTier(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveFeedback(searchParams: BillingSearchParams): {
  tone: "success" | "warning" | "error";
  message: string;
} | null {
  if (searchParams.checkout === "success") {
    return {
      tone: "success",
      message:
        "Stripe checkout completed. Your host tier will refresh as soon as the webhook is processed.",
    };
  }

  if (searchParams.checkout === "canceled") {
    return {
      tone: "warning",
      message: "Stripe checkout was canceled. No subscription changes were made.",
    };
  }

  switch (searchParams.error) {
    case "invalid_plan":
    case "invalid_interval":
      return {
        tone: "error",
        message: "The requested billing plan was invalid. Choose a plan and try again.",
      };
    case "unauthenticated":
    case "expired_session":
      return {
        tone: "error",
        message: "Sign in again as a host before managing billing.",
      };
    case "host_profile_missing":
      return {
        tone: "error",
        message: "Complete host onboarding before starting a subscription.",
      };
    case "portal_unavailable":
      return {
        tone: "error",
        message:
          "No Stripe customer was found for this host yet. Start a subscription first, then return here to manage it.",
      };
    case "checkout_failed":
    case "missing_checkout_url":
      return {
        tone: "error",
        message:
          "Stripe checkout could not be started. Verify the Stripe keys and price ids, then try again.",
      };
    default:
      return null;
  }
}

export default async function HostBillingPage({
  searchParams,
}: {
  searchParams: Promise<BillingSearchParams>;
}) {
  const query = await searchParams;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  if (!userId || !token) {
    return (
      <section className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.heading}>Billing</h1>
          <p className={styles.subheading}>
            Sign in as a host to start or manage your Stripe subscription.
          </p>
        </div>
      </section>
    );
  }

  const [hostProfile, currentTier] = await Promise.all([
    getHostProfile(token, userId).catch(() => null),
    getHostSubscriptionTier(token, userId).catch(() => "none" as const),
  ]);
  const feedback = resolveFeedback(query);
  const checkoutConfigured = hasStripeCheckoutConfig();

  // The host's own refund-request history (RLS-scoped to their host profile).
  const refundHistory: HostRefundRequestView[] = hostProfile
    ? await getHostRefundRequests(token, hostProfile.id)
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            purchaseType: r.purchaseType,
            amountCents: r.amountCents,
            reason: r.reason,
            status: r.status,
            adminNote: r.adminNote,
            createdAt: r.createdAt,
            resolvedAt: r.resolvedAt,
          })),
        )
        .catch(() => [])
    : [];

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Billing</h1>
          <p className={styles.subheading}>
            Start a host subscription in Stripe and keep your current tier mirrored back into Explore &amp; Earn.
          </p>
        </div>
        <form action={startHostBillingPortalAction}>
          <button className={styles.secondaryButton} type="submit">
            Manage in Stripe
          </button>
        </form>
      </div>

      {feedback ? (
        <div className={styles[feedback.tone]} role="status">
          {feedback.message}
        </div>
      ) : null}

      {!checkoutConfigured ? (
        <div className={styles.warning} role="status">
          Stripe is not fully configured yet. Set the secret key, webhook secret,
          and all six host price ids before using this billing page in production.
        </div>
      ) : null}

      <Card title="Current plan">
        <div className={styles.currentPlan}>
          <p className={styles.currentPlanName}>{titleCaseTier(currentTier)}</p>
          <p className={styles.currentPlanMeta}>
            {hostProfile?.companyName && hostProfile.companyName.trim().length > 0
              ? hostProfile.companyName
              : "Explore & Earn host"}
          </p>
          <p className={styles.currentPlanHint}>
            Stripe webhooks keep this value synced to <code>host_profiles.subscription_tier</code>.
          </p>
        </div>
      </Card>

      <div className={styles.planGrid}>
        {HOST_PLAN_TIERS.map((tier) => {
          const pricing = FOUNDER_LOCKED_PRICING[tier];
          const entitlements = PLAN_ENTITLEMENTS[tier];

          return (
            <Card key={tier} title={titleCaseTier(tier)}>
              <div className={styles.pricingBlock}>
                <div className={styles.pricePair}>
                  <strong>{formatCurrency(pricing.monthly)}</strong>
                  <span>monthly</span>
                </div>
                <div className={styles.pricePair}>
                  <strong>{formatCurrency(pricing.yearly)}</strong>
                  <span>annual · {ANNUAL_MONTHS_BILLED} months billed</span>
                </div>
              </div>

              <ul className={styles.entitlements}>
                <li>{entitlements.listings} live listing slots</li>
                <li>{entitlements.includedInviteCredits} included invite credits</li>
                <li>{entitlements.monthlyAnnouncements} monthly announcements</li>
                <li>{entitlements.teamSeats} team seats</li>
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

      <Card title="Request a refund">
        <HostRefundPanel history={refundHistory} />
      </Card>
    </section>
  );
}