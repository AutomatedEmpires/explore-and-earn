import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";
import {
  SOURCED_DISCLOSURE_LABEL,
  type ListingProvenanceInfo,
} from "@explore-and-earn/contracts";

import styles from "./SourcedNotice.module.css";

/**
 * The sourced-listing disclosure banner for the immersive detail page.
 *
 * Renders ONLY for provenance === 'sourced'. States plainly that the listing
 * is real and attributable but NOT confirmed by Explore & Earn, shows the
 * source attribution, links safely to the original posting, and offers the
 * employer a claim entry point. Never softens the meaning; never presents a
 * host, review, or verified badge (there is none to present).
 */
export function SourcedNotice({
  listingId,
  provenance,
}: {
  readonly listingId: string;
  readonly provenance: ListingProvenanceInfo | undefined;
}) {
  if (provenance?.provenance !== "sourced") return null;
  const source = provenance.source;
  const retrieved = source?.retrievedAt
    ? new Date(source.retrievedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <section className={styles.notice} aria-label="Sourced listing notice">
      <div className={styles.headline}>
        <Icon name="system.info" size={20} aria-hidden />
        <div>
          <h2 className={styles.title}>{SOURCED_DISCLOSURE_LABEL}</h2>
          <p className={styles.body}>
            We found this opportunity in a public posting. Explore &amp; Earn has not
            confirmed the employer or these details. Anything the posting didn&apos;t
            state is shown as <strong>not stated</strong> — never assumed.
          </p>
        </div>
      </div>

      <dl className={styles.attribution}>
        {source?.sourceName ? (
          <div className={styles.attrRow}>
            <dt>Source</dt>
            <dd>{source.sourceName}</dd>
          </div>
        ) : null}
        {source?.employerName ? (
          <div className={styles.attrRow}>
            <dt>Employer (as stated)</dt>
            <dd>{source.employerName}</dd>
          </div>
        ) : null}
        {retrieved ? (
          <div className={styles.attrRow}>
            <dt>Last seen</dt>
            <dd>{retrieved}</dd>
          </div>
        ) : null}
      </dl>

      <div className={styles.actions}>
        {source?.sourceUrl ? (
          <a
            className={styles.sourceLink}
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <Icon name="action.forward" size={16} aria-hidden />
            View the original posting
          </a>
        ) : null}
        <Link className={styles.claimLink} href={`/claim/${listingId}`}>
          <Icon name="trust.verified_host" size={16} aria-hidden />
          Is this your opportunity? Claim it
        </Link>
        {/* Policy §6: the plain-language explanation + takedown contact must be
            linked from the disclosure band. */}
        <Link className={styles.sourceLink} href="/sourced-listings">
          <Icon name="system.info" size={16} aria-hidden />
          About sourced listings
        </Link>
      </div>
    </section>
  );
}
