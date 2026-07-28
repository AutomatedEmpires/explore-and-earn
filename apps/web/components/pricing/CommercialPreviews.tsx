import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { DemoJobCard } from "../demo/DemoJobCard";
import { DemoLabel } from "../demo/DemoLabel";
import { DemoMetricTiles } from "../demo/DemoAnalyticsExtras";
import { DemoOrgIdentity } from "../demo/DemoOrgIdentity";
import { DEMO_DATA_LABEL } from "../demo/enterpriseDemo";
import styles from "./commercialPreviews.module.css";

/**
 * What a plan actually turns on — shown, before it is priced (spec D21).
 *
 * THE ORDER IS THE ARGUMENT. The rejected plans page opened with three prices,
 * which asks a host to value something they have not seen. This block sits above
 * the matrix and answers the prior question: what does the thing look like. Each
 * panel is a REAL component from the product — the identity band, the
 * DiscoveryCard a seeker meets in Seek and Swipe, the MetricCard grid from the
 * dashboard — carrying the Enterprise demo records, and each says so.
 *
 * DEMO-LABELLED, EVERY ONE. These are sample records. A preview on a page that
 * is asking for money must not be mistakable for a promise about the host's own
 * numbers, so the label the fixtures declare is rendered on each panel rather
 * than once at the top where it can be scrolled past.
 *
 * NOTHING HERE READS A HOST PROFILE, and that is a hard constraint rather than
 * an oversight: the plans page must render for a signed-in visitor who has no
 * profile row at all, and its route-topology test scans the page source for the
 * names of the profile readers. Keeping the previews on fixtures keeps that true
 * without the page having to know anything about who is looking.
 */
export function CommercialPreviews() {
  return (
    <section
      className={styles.section}
      aria-labelledby="commercial-previews-title"
    >
      <div className={styles.head}>
        <h2 id="commercial-previews-title" className={styles.title}>
          What you are activating
        </h2>
        <p className={styles.lead}>
          Three of the surfaces a plan turns on, rendered by the same components
          the product ships and filled with sample records.
        </p>
      </div>

      <div className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Your employer profile</h3>
            <DemoLabel text={DEMO_DATA_LABEL} />
          </div>
          <p className={styles.panelNote}>
            The identity band a seeker lands on: cover photograph, location,
            season, and how many positions are open.
          </p>
          <div className={styles.panelBody}>
            <DemoOrgIdentity />
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Your roles, in discovery</h3>
            <DemoLabel text={DEMO_DATA_LABEL} />
          </div>
          <p className={styles.panelNote}>
            The card a seeker meets in Seek, Swipe and Map — housing, meals and
            pay decided at a glance. Publishing is what a plan buys.
          </p>
          <div className={styles.panelBody}>
            <DemoJobCard />
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Your dashboard</h3>
          </div>
          <p className={styles.panelNote}>
            The headline tiles, derived from the same sample records rather than
            drawn to look busy.
          </p>
          <div className={styles.panelBody}>
            <DemoMetricTiles limit={4} />
          </div>
        </article>
      </div>

      <Link className={styles.tourLink} href="/for-hosts/demo">
        <Icon name="action.forward" size={16} aria-hidden />
        Walk the whole workspace — a full season, nothing to sign up for
      </Link>
    </section>
  );
}
