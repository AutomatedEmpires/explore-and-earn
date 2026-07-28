import Link from "next/link";

import {
  DemoAccountPeoplePanel,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — the people on the account.
 *
 * This surface exists to be honest rather than to sell. Invitations can be
 * sent, accepted and revoked today; accepting one grants no access to anything
 * in the workspace, and the pricing contract carries zero colleague seats on
 * every tier as a result. The page states that instead of drawing a roster that
 * implies collaboration the product does not yet do.
 */
export default function DemoTeamPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="team"
        eyebrow="People"
        title="Who is on the account, and what that means today"
        lede="The owner runs the workspace. Invitations to colleagues are recorded, and this page says plainly what accepting one currently does — because an invitation that looks like access is worse than no invitation at all."
      />

      <DemoAccountPeoplePanel id="tour-people" />

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo/plan">
          Next: plan usage
        </Link>
      </div>
    </div>
  );
}
