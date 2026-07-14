import type { Metadata } from "next";
import Link from "next/link";
import {
  getMarketplaceStats,
  getModerationStats,
  getRefundStats,
} from "@explore-and-earn/db";
import { Chip, Icon, MetricCard, MetricGrid } from "@explore-and-earn/ui";

import { AdminMarketHealth } from "../../../components/admin";
import styles from "./overview.module.css";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Whole-number percentage of a part over a whole (0 when the whole is 0). */
function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Compact display string for a count, e.g. 1640 → "1.6k". */
function compact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(value);
}

export default async function AdminDashboardPage() {
  // Service role key is read server-side only and handed to the db layer; it is
  // never serialized to the client (this is a server component).
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const stats = await getMarketplaceStats(serviceRoleToken);

  // Secondary operational queues that also need a moderator decision: community
  // reports and refund/payment requests. Read resiliently — a transient failure
  // yields zeros so the overview always renders. Counts are honest when present,
  // never fabricated.
  const [moderation, refunds] = await Promise.all([
    getModerationStats(serviceRoleToken).catch(() => null),
    getRefundStats(serviceRoleToken).catch(() => null),
  ]);
  const openReports = (moderation?.open ?? 0) + (moderation?.reviewing ?? 0);
  const openRefunds = refunds?.requested ?? 0;

  // Presentation-only derivations from the already-fetched stats. No new reads.
  const livePct = pct(stats.liveListings, stats.totalListings);
  const verifiedPct = pct(stats.verifiedHosts, stats.totalHosts);
  const hostsToVerify = Math.max(0, stats.totalHosts - stats.verifiedHosts);
  const reviewQueue = stats.underReviewListings + stats.pendingApplications;
  const acceptRate = pct(stats.acceptedApplications, stats.totalApplications);

  // A simple composite health read: how much of the marketplace is "settled"
  // (live listings + verified hosts) vs. awaiting moderation. Derived, not stored.
  const healthDenom =
    stats.totalListings + stats.totalHosts + stats.pendingApplications;
  const healthValue = pct(
    stats.liveListings + stats.verifiedHosts,
    healthDenom,
  );

  return (
    <section className={styles.page}>
      {/* ---- Board header --------------------------------------------- */}
      <header className={styles.board}>
        <span className={styles.kicker}>
          <span className={styles.dot} aria-hidden="true" />
          Admin / moderation control
        </span>
        <h1 className={styles.headline}>
          Moderate the marketplace without losing{" "}
          <em>platform momentum.</em>
        </h1>
        <p className={styles.sub}>
          One operational command board for queue review, listing quality, and
          host verification — high-risk items, incomplete listings, and trust
          holds should land here first, not be hunted for.
        </p>

        <div className={styles.opsStrip}>
          <div className={styles.opsNode} data-tone={reviewQueue > 0 ? "hot" : "good"}>
            <span className={styles.opsValue}>{reviewQueue}</span>
            <span className={styles.opsLabel}>Review queue</span>
          </div>
          <div className={styles.opsNode} data-tone={openReports > 0 ? "hot" : "good"}>
            <span className={styles.opsValue}>{openReports}</span>
            <span className={styles.opsLabel}>Community reports</span>
          </div>
          <div className={styles.opsNode} data-tone={openRefunds > 0 ? "hot" : "good"}>
            <span className={styles.opsValue}>{openRefunds}</span>
            <span className={styles.opsLabel}>Refund requests</span>
          </div>
          <div className={styles.opsNode} data-tone={hostsToVerify > 0 ? "hot" : "good"}>
            <span className={styles.opsValue}>{hostsToVerify}</span>
            <span className={styles.opsLabel}>Hosts to verify</span>
          </div>
          <div className={styles.opsNode}>
            <span className={styles.opsValue}>{compact(stats.liveListings)}</span>
            <span className={styles.opsLabel}>Listings live</span>
          </div>
          <div className={styles.opsNode} data-tone="good">
            <span className={styles.opsValue}>{healthValue}%</span>
            <span className={styles.opsLabel}>Health</span>
          </div>
        </div>
      </header>

      {/* ---- Command metric row --------------------------------------- */}
      <MetricGrid>
        <MetricCard
          label="Pending review"
          value={reviewQueue}
          trend={reviewQueue > 0 ? "Needs review" : "Clear"}
          trendTone={reviewQueue > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Listings live"
          value={stats.liveListings}
          trend={`${livePct}% of ${stats.totalListings}`}
          trendTone="neutral"
        />
        <MetricCard
          label="Hosts to verify"
          value={hostsToVerify}
          trend={hostsToVerify > 0 ? "Awaiting" : "All clear"}
          trendTone={hostsToVerify > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Marketplace health"
          value={`${healthValue}%`}
          trend={healthValue >= 70 ? "Stable" : "Watch"}
          trendTone={healthValue >= 70 ? "up" : "neutral"}
        />
      </MetricGrid>

      {/* ---- Operational split: queue + health ------------------------ */}
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Priority moderation workbench</h2>
          <p className={styles.sectionSub}>
            What needs a moderator now, and where the platform stands on trust
            and inventory.
          </p>
        </div>
      </div>

      <div className={styles.split}>
        {/* Live review queue summary */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Live review queue</h3>
              <p className={styles.panelNote}>
                Sorted by impact — applications, listings, community reports, and
                refund requests that need a moderator decision now.
              </p>
            </div>
          </div>

          <div className={styles.queue}>
            <Link
              href="/applications"
              className={styles.queueRow}
              data-tone={stats.pendingApplications > 0 ? "hot" : undefined}
            >
              <span className={styles.queueIcon}>
                <Icon name="action.apply" size={20} aria-hidden />
              </span>
              <span className={styles.queueBody}>
                <span className={styles.queueLabel}>Applications awaiting review</span>
                <span className={styles.queueMeta}>Status: applied</span>
              </span>
              <span className={styles.queueCount}>{stats.pendingApplications}</span>
              <span className={styles.queueGo} aria-hidden="true">
                <Icon name="action.view" size={20} aria-hidden />
              </span>
            </Link>

            <Link
              href="/listings"
              className={styles.queueRow}
              data-tone={stats.underReviewListings > 0 ? "hot" : undefined}
            >
              <span className={styles.queueIcon}>
                <Icon name="category.mix" size={20} aria-hidden />
              </span>
              <span className={styles.queueBody}>
                <span className={styles.queueLabel}>Listings under review</span>
                <span className={styles.queueMeta}>Held for moderation</span>
              </span>
              <span className={styles.queueCount}>{stats.underReviewListings}</span>
              <span className={styles.queueGo} aria-hidden="true">
                <Icon name="action.view" size={20} aria-hidden />
              </span>
            </Link>

            <Link
              href="/admin/reports"
              className={styles.queueRow}
              data-tone={openReports > 0 ? "hot" : undefined}
            >
              <span className={styles.queueIcon}>
                <Icon name="action.report" size={20} aria-hidden />
              </span>
              <span className={styles.queueBody}>
                <span className={styles.queueLabel}>Community reports open</span>
                <span className={styles.queueMeta}>Awaiting moderation</span>
              </span>
              <span className={styles.queueCount}>{openReports}</span>
              <span className={styles.queueGo} aria-hidden="true">
                <Icon name="action.view" size={20} aria-hidden />
              </span>
            </Link>

            <Link
              href="/admin/refunds"
              className={styles.queueRow}
              data-tone={openRefunds > 0 ? "hot" : undefined}
            >
              <span className={styles.queueIcon}>
                <Icon name="benefit.pay" size={20} aria-hidden />
              </span>
              <span className={styles.queueBody}>
                <span className={styles.queueLabel}>Refund requests open</span>
                <span className={styles.queueMeta}>Payment / subscription</span>
              </span>
              <span className={styles.queueCount}>{openRefunds}</span>
              <span className={styles.queueGo} aria-hidden="true">
                <Icon name="action.view" size={20} aria-hidden />
              </span>
            </Link>

            <Link
              href="/hosts"
              className={styles.queueRow}
              data-tone={hostsToVerify > 0 ? "hot" : undefined}
            >
              <span className={styles.queueIcon}>
                <Icon name="profile.verification" size={20} aria-hidden />
              </span>
              <span className={styles.queueBody}>
                <span className={styles.queueLabel}>Hosts pending verification</span>
                <span className={styles.queueMeta}>Trust + safety hold</span>
              </span>
              <span className={styles.queueCount}>{hostsToVerify}</span>
              <span className={styles.queueGo} aria-hidden="true">
                <Icon name="action.view" size={20} aria-hidden />
              </span>
            </Link>

            <Link href="/listings" className={styles.queueRow}>
              <span className={styles.queueIcon}>
                <Icon name="status.draft" size={20} aria-hidden />
              </span>
              <span className={styles.queueBody}>
                <span className={styles.queueLabel}>Drafts in progress</span>
                <span className={styles.queueMeta}>Not yet submitted</span>
              </span>
              <span className={styles.queueCount}>{stats.draftListings}</span>
              <span className={styles.queueGo} aria-hidden="true">
                <Icon name="action.view" size={20} aria-hidden />
              </span>
            </Link>
          </div>

          <div className={styles.ctaRow}>
            <Link className={styles.cta} href="/applications">
              <Icon name="action.view" size={20} aria-hidden />
              Open moderation queue
            </Link>
            <Link className={`${styles.cta} ${styles.ctaGhost}`} href="/admin/guidelines">
              <Icon name="nav.help" size={20} aria-hidden />
              Guidelines
            </Link>
          </div>
        </div>

        {/* Health + diagnosis */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h3 className={styles.panelTitle}>Platform diagnosis</h3>
              <p className={styles.panelNote}>
                Trust, inventory, and throughput at a glance.
              </p>
            </div>
          </div>

          <div className={styles.healthCard}>
            <div className={styles.healthTop}>
              <span className={styles.opsLabel}>Marketplace health</span>
              <span className={styles.healthValue}>{healthValue}%</span>
            </div>
            <div
              className={styles.healthBar}
              role="meter"
              aria-valuenow={healthValue}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Marketplace health"
            >
              <span
                className={styles.healthFill}
                style={{ width: `${healthValue}%` }}
                aria-hidden="true"
              />
            </div>
          </div>

          <ul className={styles.diagList}>
            <li
              className={styles.diagRow}
              data-tone={verifiedPct >= 60 ? "good" : "warn"}
            >
              <span className={styles.diagIcon}>
                <Icon name="status.boosted" size={16} aria-hidden />
              </span>
              <span className={styles.diagBody}>
                <span className={styles.diagLabel}>Host verification</span>
                <span className={styles.diagMeta}>
                  {stats.verifiedHosts} of {stats.totalHosts} hosts verified
                </span>
              </span>
              <span className={styles.diagValue}>{verifiedPct}%</span>
            </li>

            <li
              className={styles.diagRow}
              data-tone={livePct >= 50 ? "good" : "warn"}
            >
              <span className={styles.diagIcon}>
                <Icon name="status.open" size={16} aria-hidden />
              </span>
              <span className={styles.diagBody}>
                <span className={styles.diagLabel}>Inventory live</span>
                <span className={styles.diagMeta}>
                  {stats.liveListings} of {stats.totalListings} listings published
                </span>
              </span>
              <span className={styles.diagValue}>{livePct}%</span>
            </li>

            <li className={styles.diagRow} data-tone="good">
              <span className={styles.diagIcon}>
                <Icon name="status.accepted" size={16} aria-hidden />
              </span>
              <span className={styles.diagBody}>
                <span className={styles.diagLabel}>Application throughput</span>
                <span className={styles.diagMeta}>
                  {stats.acceptedApplications} accepted of {stats.totalApplications}
                </span>
              </span>
              <span className={styles.diagValue}>{acceptRate}%</span>
            </li>

            <li className={styles.diagRow}>
              <span className={styles.diagIcon}>
                <Icon name="nav.seekers" size={16} aria-hidden />
              </span>
              <span className={styles.diagBody}>
                <span className={styles.diagLabel}>Seeker community</span>
                <span className={styles.diagMeta}>Total registered seekers</span>
              </span>
              <span className={styles.diagValue}>{compact(stats.totalSeekers)}</span>
            </li>
          </ul>

          <div className={styles.chipRail}>
            <Chip icon="benefit.pay">Require pay range</Chip>
            <Chip icon="benefit.housing">Enforce housing disclosure</Chip>
            <Chip icon="profile.verification">Auto-hold unverified hosts</Chip>
          </div>
        </div>
      </div>

      {/* ---- Marketplace liquidity analytics -------------------------- */}
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Marketplace health</h2>
          <p className={styles.sectionSub}>
            Two-sided liquidity from live counts — is supply absorbing demand,
            and is trust keeping up.
          </p>
        </div>
      </div>

      <AdminMarketHealth stats={stats} />
    </section>
  );
}
