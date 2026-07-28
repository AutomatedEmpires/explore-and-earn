import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import {
  DEMO_LIVE_ROLES,
  DemoJobCard,
  DemoOrgFacts,
  DemoOrgIdentity,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/** Demo workspace — the public employer profile every role hangs off. */
export default function DemoProfilePage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="profile"
        eyebrow="Employer profile"
        title="The page seekers read before they read your listing"
        lede="One profile carries the season, the crew, the housing and the meals. Every one of your roles inherits that context instead of repeating it — which is why a seeker can judge the place in ten seconds and the listing in thirty."
      />

      <DemoOrgIdentity id="tour-profile-identity" />
      <DemoOrgFacts id="tour-profile-facts" />

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>
              Open roles on this profile ({DEMO_LIVE_ROLES.length})
            </h2>
            <p className={styles.panelNote}>
              A seeker who lands on your profile sees your live roles as the same
              cards they see everywhere else — the production DiscoveryCard, not
              a drawing of it.
            </p>
          </div>
        </div>
        <DemoJobCard />
        <div className={styles.linkRow}>
          <Link className={styles.primaryCta} href="/sign-up?role=host">
            <Icon name="nav.host" size={18} aria-hidden />
            Build your host profile
          </Link>
          <Link className={styles.ghostCta} href="/for-hosts/demo/seeker-view">
            See the whole profile as a seeker
          </Link>
        </div>
      </div>
    </div>
  );
}
