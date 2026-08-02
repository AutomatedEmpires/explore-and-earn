import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import styles from "./not-found.module.css";

// Keeps the crawl/e2e contract of the shared 404 ("Page not found") while the
// body speaks the listing-truth in the Basecamp voice.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * The gone-listing face. A dead listing link is a normal marketplace event —
 * listings close, fill, expire, or never existed — and the reader deserves the
 * truth plus a forward door, not the site-wide cosmic-joke 404. We deliberately
 * do NOT guess WHICH of those happened: the id resolves to nothing, and
 * claiming "this role was filled" would invent a fact we don't have.
 */
export default function ListingNotFound() {
  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The marketplace</p>
        <h1 className={styles.title}>
          This opportunity isn&rsquo;t listed
          <span className={styles.titleMark} aria-hidden>
            .
          </span>
        </h1>
        <p className={styles.lede}>
          Listings leave the marketplace when they close, fill, or expire — and
          links outlive all three. Everything else is still here: the search,
          the four lanes, and the map are live.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/seek">
            Browse open opportunities
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
          <Link className={styles.quiet} href="/jobs">
            <Icon name="nav.seek" size={16} aria-hidden />
            See the four lanes
          </Link>
        </div>
      </div>
    </div>
  );
}
