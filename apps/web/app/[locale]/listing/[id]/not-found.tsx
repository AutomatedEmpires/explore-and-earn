import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Icon } from "@explore-and-earn/ui";

import { Link } from "../../../../i18n/navigation";
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
export default async function ListingNotFound() {
  const t = await getTranslations("ListingNotFound");

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h1 className={styles.title}>
          {t("title")}
          <span className={styles.titleMark} aria-hidden>
            .
          </span>
        </h1>
        <p className={styles.lede}>{t("lede")}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/seek">
            {t("browse")}
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
          <Link className={styles.quiet} href="/jobs">
            <Icon name="nav.seek" size={16} aria-hidden />
            {t("lanes")}
          </Link>
        </div>
      </div>
    </div>
  );
}
