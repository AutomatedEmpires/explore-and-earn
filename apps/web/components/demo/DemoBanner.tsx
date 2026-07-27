import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { DEMO_BANNER_TEXT } from "./enterpriseDemo";
import { DemoBrandMark } from "./DemoBrandMark";
import styles from "./demoChrome.module.css";

/**
 * The persistent demo disclosure, rendered by the demo LAYOUT so it is present
 * on every demo surface by construction rather than by each page remembering.
 * Sticky, so it stays true while the visitor scrolls a page of sample figures.
 */
export function DemoBanner() {
  return (
    <div className={styles.banner} role="note" aria-label="Demo workspace notice">
      <span className={styles.bannerMark}>
        <DemoBrandMark size={20} />
      </span>
      <p className={styles.bannerText}>{DEMO_BANNER_TEXT}</p>
      <Link className={styles.bannerCta} href="/sign-up?role=host">
        <Icon name="nav.host" size={16} aria-hidden />
        Build your host profile
      </Link>
    </div>
  );
}
