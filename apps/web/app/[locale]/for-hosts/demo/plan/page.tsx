import Link from "next/link";
import { FOUNDER_LOCKED_PRICING, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";
import { Icon } from "@explore-and-earn/ui";

import { formatMoney } from "../../../../../lib/format";
import {
  DEMO_DRAFT_ROLES,
  DEMO_LIVE_ROLES,
  DEMO_ORG,
  DemoPlanUsage,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — plan usage and the activation line.
 *
 * The last two tour stops live here. The prices and the allowances are read
 * from the pricing contract, never typed: this page is the one most likely to
 * be skimmed for a number, and a number that came from a component instead of
 * the contract is how a plan gets mis-sold.
 */
export default function DemoPlanPage() {
  const entitlement = PLAN_ENTITLEMENTS[DEMO_ORG.planTier];
  const price = FOUNDER_LOCKED_PRICING[DEMO_ORG.planTier];

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="plan"
        eyebrow="Plan usage"
        title="What your plan lets you run, counted before you hit it"
        lede={`This workspace is on ${DEMO_ORG.planName} at ${formatMoney(price.monthly)} a month. Active listings, invite credits and announcement runs are counted against the allowance and shown next to it — you find out you are at the limit here, not at publish time.`}
      />

      <DemoPlanUsage id="tour-plan-usage" />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>What this plan includes</h2>
            <p className={styles.panelNote}>
              Read from the pricing contract the server enforces.
            </p>
          </div>
        </div>
        <ul className={styles.factGrid}>
          <li className={styles.fact}>
            <span className={styles.factLabel}>Active listings</span>
            <span className={styles.factValue}>{entitlement.listings}</span>
          </li>
          <li className={styles.fact}>
            <span className={styles.factLabel}>Invite credits a month</span>
            <span className={styles.factValue}>
              {entitlement.includedInviteCredits}
            </span>
          </li>
          <li className={styles.fact}>
            <span className={styles.factLabel}>Announcement runs a month</span>
            <span className={styles.factValue}>
              {entitlement.monthlyAnnouncements}
            </span>
          </li>
          <li className={styles.fact}>
            <span className={styles.factLabel}>Analytics depth</span>
            <span className={styles.factValue}>
              {entitlement.analytics === "full"
                ? "Full — including the per-role breakdown"
                : "Account-wide aggregates"}
            </span>
          </li>
        </ul>
      </div>

      <div className={styles.panel} id="tour-activation">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>
              Build it all first; pay when you want to publish
            </h2>
          </div>
        </div>
        <ul className={styles.checkList}>
          <li className={styles.checkItem}>
            <span className={styles.checkIcon}>
              <Icon name="system.success" size={16} aria-hidden />
            </span>
            An account, an employer profile, branding, drafts and previews cost
            nothing and need no card.
          </li>
          <li className={styles.checkItem}>
            <span className={styles.checkIcon}>
              <Icon name="system.lock" size={16} aria-hidden />
            </span>
            A plan is what makes a role publishable and discoverable, and what
            opens applications, messaging, announcements and real analytics.
          </li>
          <li className={styles.checkItem}>
            <span className={styles.checkIcon}>
              <Icon name="system.info" size={16} aria-hidden />
            </span>
            This demo workspace has {DEMO_LIVE_ROLES.length} published roles and{" "}
            {DEMO_DRAFT_ROLES.length} drafts. The drafts would exist on a free
            account exactly as they do here; the published ones would not.
          </li>
        </ul>
        <div className={styles.linkRow}>
          <Link className={styles.primaryCta} href="/sign-up?role=host">
            <Icon name="nav.host" size={18} aria-hidden />
            Build your host profile
          </Link>
          <Link className={styles.ghostCta} href="/host/plans">
            See the plans
          </Link>
        </div>
      </div>
    </div>
  );
}
