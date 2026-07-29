import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ADDON_PRICING,
  ANNOUNCEMENT_MONTHLY_QUOTA,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";
import { Card } from "@explore-and-earn/ui";
import {
  countHostAnnouncementsThisMonth,
  effectiveListingCap,
  getHostListings,
  getHostProfile,
  getHostRefundRequests,
  getHostSubscriptionByClerkUserId,
  getHostSubscriptionTier,
  getInviteEntitlement,
  getPurchasedListingSlots,
  hostAccountState,
} from "@explore-and-earn/db";

import { formatDate, formatMoney } from "../../../../../lib/format";
import { startHostBillingPortalAction } from "../../../../actions/hostBilling";
import {
  HostUsageMeters,
  type HostUsageRow,
} from "../../../../../components/host";
import {
  HostRefundPanel,
  type HostRefundRequestView,
} from "../../../../../components/host/HostRefundPanel";
import {
  hasStripeCheckoutConfig,
  listHostInvoices,
  type HostInvoiceSummary,
} from "../../../../../services/stripe";
import { cadenceFromInvoices } from "./billing-cadence";
import { PlanUsageViewed } from "./PlanUsageViewed";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

/**
 * Billing — the subscription and account-value centre (V2 D21, §13).
 *
 * IT IS NOT A SECOND PLANS PAGE, and that is the point of the rewrite. This
 * page previously rendered three plan cards with monthly and annual checkout
 * buttons, which made THREE plan grids in the product — here, in Settings, and
 * on /host/plans — with three different presentations of the same
 * founder-locked prices. D21 collapses that: /host/plans is the one commercial
 * decision surface, and this page LINKS to it. A test pins the absence, because
 * a plan card is exactly the kind of thing that gets helpfully re-added.
 *
 * What it does instead: says what the host is on, what it renews to and when,
 * how much of the plan they have actually used, what they have been charged,
 * what they can add, and how to ask for money back.
 */

type BillingSearchParams = {
  checkout?: string;
  error?: string;
};

function titleCaseTier(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const ACCOUNT_STATE_COPY: Record<string, string> = {
  prospect: "No plan yet — you can build and preview, but not publish.",
  active: "Active.",
  lapsed: "Payment is failing. Publishing is closed until it clears.",
  cancelled: "Cancelled — it will not renew.",
};

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
    case "rate_limited":
      return {
        tone: "error",
        message:
          "You've started several billing sessions just now. Give it a few minutes, then try again.",
      };
    // Guarded rather than silently allowed: a second checkout would create a
    // second concurrent Stripe subscription and bill for both.
    case "already_subscribed":
      return {
        tone: "warning",
        message:
          "You're already on a plan. Use “Manage billing” to switch tiers or change how you pay — that swaps your plan instead of starting a second subscription.",
      };
    default:
      return null;
  }
}

function formatRenewal(iso: string | null): string | null {
  if (!iso) return null;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return formatDate(iso, { month: "long", day: "numeric", year: "numeric" });
}

/** Stripe hands back unix SECONDS; the formatter takes an ISO string. */
function formatInvoiceDay(unixSeconds: number): string {
  return formatDate(new Date(unixSeconds * 1000).toISOString(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function HostBillingPage({
  searchParams,
}: {
  searchParams: Promise<BillingSearchParams>;
}) {
  const query = await searchParams;
  const { userId, getToken } = await auth();
  const token = userId ? await getToken() : null;

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

  const [hostProfile, currentTier, subscription, listings, purchasedSlots, invites] =
    await Promise.all([
      getHostProfile(token, userId).catch(() => null),
      getHostSubscriptionTier(token, userId).catch(() => "none" as const),
      getHostSubscriptionByClerkUserId(userId).catch(() => null),
      getHostListings(token, userId).catch(() => []),
      getPurchasedListingSlots(token).catch(() => 0),
      getInviteEntitlement(token, userId).catch(() => null),
    ]);

  const [announcementsUsed, invoiceResult] = await Promise.all([
    hostProfile
      ? countHostAnnouncementsThisMonth(token, hostProfile.id).catch(() => 0)
      : Promise.resolve(0),
    listHostInvoices(userId).catch(() => ({
      ok: false,
      invoices: [] as HostInvoiceSummary[],
      error: "Billing history could not be read.",
    })),
  ]);

  const feedback = resolveFeedback(query);
  const checkoutConfigured = hasStripeCheckoutConfig();
  const accountState = hostAccountState(subscription);
  const renewalDate = formatRenewal(subscription?.currentPeriodEnd ?? null);
  const cadence = cadenceFromInvoices(currentTier, invoiceResult.invoices);

  const activeListings = listings.filter((row) =>
    ["live", "paused", "under_review"].includes(row.status),
  ).length;
  const listingCap = effectiveListingCap(currentTier, purchasedSlots);
  const announcementQuota = ANNOUNCEMENT_MONTHLY_QUOTA[currentTier] ?? null;

  const usageRows: HostUsageRow[] = [
    {
      id: "listings",
      label: "Active listings",
      used: activeListings,
      included: listingCap,
      note:
        purchasedSlots > 0
          ? `${purchasedSlots} extra slot${purchasedSlots === 1 ? "" : "s"} purchased on top of your plan. Drafts are unlimited and do not count.`
          : "Live, paused and in-review roles count. Drafts are unlimited and do not count.",
    },
    {
      id: "invites",
      label: "Invite credits this period",
      used: invites ? invites.monthlyUsed : 0,
      included: invites ? invites.monthlyAllowance : null,
      note: invites
        ? `${invites.totalRemaining} remaining in total, including ${invites.purchasedBalance} purchased.`
        : "The credit ledger could not be read just now.",
    },
    {
      id: "announcements",
      label: "Announcement runs this month",
      used: announcementsUsed,
      included: announcementQuota,
      note: "Purchased single runs are counted separately and never draw on this allowance.",
    },
  ];

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
      <PlanUsageViewed />

      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Billing</h1>
          <p className={styles.subheading}>
            What you are on, what you have used, and what you have been charged.
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
          <dl className={styles.factList}>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>Status</dt>
              <dd className={styles.factValue}>
                {ACCOUNT_STATE_COPY[accountState] ?? accountState}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>Billing cadence</dt>
              <dd className={styles.factValue}>
                {cadence === "monthly"
                  ? "Monthly, read from your most recent invoice."
                  : cadence === "annual"
                    ? "Annual, read from your most recent invoice."
                    : "Not recorded on this account — the Stripe portal is the authority."}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>
                {accountState === "cancelled" ? "Access ends" : "Renews"}
              </dt>
              <dd className={styles.factValue}>
                {renewalDate ?? "No renewal date on record."}
              </dd>
            </div>
            {/*
              THE EARLY-HOST PROGRAMME IS NOT REPORTED HERE, and could not
              honestly be. Its claims live in their own table (migration 087)
              with no per-host read behind them, so this page cannot tell an
              enrolled account from an unenrolled one. Saying either would be a
              guess about money, and guardrail G53 refuses the language outright
              outside the programme's own allow-listed surfaces — correctly.
              Adding a claim-lookup query is the prerequisite, not more copy.
            */}
          </dl>
          {/*
            D21: ONE plans surface. A link, never a second grid.
          */}
          <Link className={styles.planLink} href="/host/plans">
            Compare plans and what each one includes
          </Link>
        </div>
      </Card>

      <Card title="What you have used">
        <HostUsageMeters rows={usageRows} />
        <p className={styles.cardNote}>
          Boost campaigns are not listed here: nothing reads a single host&rsquo;s
          active boosts, so a count would have to be invented. Each boost&rsquo;s
          run shows on the listing it was bought for.
        </p>
      </Card>

      <Card title="Billing history">
        {invoiceResult.invoices.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.tableCaption}>
                Read live from Stripe — every charge on this account, newest
                first.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Invoice</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {invoiceResult.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{formatInvoiceDay(invoice.createdAt)}</td>
                    <td>{invoice.number ?? "—"}</td>
                    <td className={styles.num}>
                      {formatMoney(invoice.amountPaidCents)}
                    </td>
                    <td>{invoice.status}</td>
                    <td>
                      {invoice.hostedInvoiceUrl ? (
                        <a
                          className={styles.receiptLink}
                          href={invoice.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.cardNote}>
            {invoiceResult.ok
              ? "No charges yet. Invoices appear here the moment Stripe issues one."
              : "Billing history could not be read from Stripe just now. Your invoices are always available in the Stripe portal."}
          </p>
        )}
      </Card>

      <Card title="Add-ons">
        <p className={styles.cardNote}>
          Bought per use, never bundled into the plan price. Every figure below
          comes from the pricing contract the server enforces.
        </p>
        <ul className={styles.addonList}>
          <li className={styles.addon}>
            <span className={styles.addonName}>Extra active listing</span>
            <span className={styles.addonPrice}>
              {formatMoney(
                ADDON_PRICING.additionalListingMonthly[
                  currentTier as keyof typeof ADDON_PRICING.additionalListingMonthly
                ] ?? ADDON_PRICING.additionalListingMonthly.starter,
              )}
              {" / month"}
            </span>
            <span className={styles.addonNote}>
              Your plan includes {PLAN_ENTITLEMENTS[
                currentTier as keyof typeof PLAN_ENTITLEMENTS
              ]?.listings ?? 0}
              . Each add-on raises the cap by one.
            </span>
            <Link className={styles.addonLink} href="/host/settings">
              Buy in Settings
            </Link>
          </li>
          <li className={styles.addon}>
            <span className={styles.addonName}>Extra announcement run</span>
            <span className={styles.addonPrice}>
              {formatMoney(ADDON_PRICING.additionalAnnouncement.priceCents)}
            </span>
            <span className={styles.addonNote}>
              One flat price for a{" "}
              {ADDON_PRICING.additionalAnnouncement.runDays}-day run, beyond your
              monthly allowance.
            </span>
            <Link className={styles.addonLink} href="/host/announcements">
              Buy on Announcements
            </Link>
          </li>
          <li className={styles.addon}>
            <span className={styles.addonName}>Listing boost</span>
            <span className={styles.addonPrice}>
              from {formatMoney(ADDON_PRICING.boost.d7)}
            </span>
            <span className={styles.addonNote}>
              7, 14 or 28 days of raised placement on one role.
            </span>
            <Link className={styles.addonLink} href="/host/listings">
              Buy on a listing
            </Link>
          </li>
        </ul>
      </Card>

      {/*
        The refund flow stays, but it is no longer the last card under three
        plan tiles — a "request a refund" control sitting beneath marketing was
        the wrong adjacency. It now sits with the charges it is about.
      */}
      <Card title="Request a refund">
        <p className={styles.cardNote}>
          For a charge in the history above. Requests are reviewed against the
          real Stripe charge, and the exact refundable amount is verified before
          anything moves.
        </p>
        <HostRefundPanel history={refundHistory} />
      </Card>
    </section>
  );
}
