import Link from "next/link";
import { PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  DEMO_DRAFT_ROLES,
  DEMO_LIVE_ROLES,
  DEMO_ORG,
  DEMO_ROLES,
  DemoListingsLive,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — the role inventory. Busy by construction, never empty. */
export default function DemoListingsPage() {
  const included = PLAN_ENTITLEMENTS[DEMO_ORG.planTier].listings;
  const closing = DEMO_LIVE_ROLES.filter((role) => role.closingSoon);

  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="listings"
        eyebrow="Listings"
        title="Seven roles, and the two that are not live say so"
        lede="Five published roles taking applications, one of them closing this week, and two drafts that are honest about being drafts. A draft costs nothing, is not discoverable, and takes no applications — publishing is what a plan buys."
      />

      <div className={styles.callout}>
        <p className={styles.calloutTitle}>
          {DEMO_LIVE_ROLES.length} live of {included} the {DEMO_ORG.planName}{" "}
          plan allows · {DEMO_DRAFT_ROLES.length} drafts ·{" "}
          {closing.length} closing within a week
        </p>
        <p className={styles.calloutBody}>
          The allowance is read from the pricing contract the server enforces,
          not typed into this page. Publishing an eighth role would need either
          a plan change or the additional-listing add-on, and the workspace says
          so here rather than at publish time.
        </p>
      </div>

      <DemoListingsLive id="tour-listing-inventory" />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/for-hosts/demo/job">
          Open the flagship role
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/seeker-view">
          See all {DEMO_ROLES.length} as a seeker would
        </Link>
      </div>
    </div>
  );
}
