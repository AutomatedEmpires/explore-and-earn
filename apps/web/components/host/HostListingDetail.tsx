import Link from "next/link";
import { Badge, DiscoveryCard, Icon } from "@explore-and-earn/ui";

import { CATEGORY_LABEL, toDiscoveryCardData } from "../discovery";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  HOST_LISTING_STATE_ICON,
  HOST_LISTING_STATE_LABEL,
  countByStage,
  type ApplicantStage,
  type HostApplicantItem,
  type HostListingItem,
} from "./models";
import styles from "./HostListingDetail.module.css";

export interface HostListingDetailProps {
  readonly item: HostListingItem;
  readonly applicants: readonly HostApplicantItem[];
  /**
   * Whether the current viewer owns this listing and may edit it. Defaults to
   * true (the management surface). When false (e.g. a read-only public record
   * surfaced to a non-owner), the edit affordance is hidden.
   */
  readonly canEdit?: boolean;
}

const PIPELINE_ORDER: readonly ApplicantStage[] = [
  "new",
  "reviewing",
  "saved_by_host",
  "offered",
  "declined",
];

/**
 * Host listing detail — a management view of a single opportunity. Surfaces
 * lifecycle status, the applicant pipeline tally, a seeker-facing preview via
 * the canonical DiscoveryCard, and the applicants who applied. Presentation
 * only: no hiring decisions are taken here (match/hiring pipeline is
 * founder-gated and out of scope).
 */
export function HostListingDetail({
  item,
  applicants,
  canEdit = true,
}: HostListingDetailProps) {
  const { listing, state } = item;
  const stages = countByStage(applicants);
  const pipelineId = `pipeline-${listing.id}`;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{listing.title}</span>
          <span className={styles.meta}>
            {CATEGORY_LABEL[listing.category]} · {listing.location} ·{" "}
            {listing.opportunityWindow}
          </span>
        </div>
        <Badge
          label={HOST_LISTING_STATE_LABEL[state]}
          icon={HOST_LISTING_STATE_ICON[state]}
        />
      </header>

      {canEdit ? (
        <Link className={styles.edit} href={`/host/listings/${listing.id}/edit`}>
          <Icon name="action.forward" size={20} aria-hidden />
          <span>Edit listing</span>
        </Link>
      ) : null}

      <section className={styles.section} aria-labelledby={pipelineId}>
        <h3 className={styles.sectionTitle} id={pipelineId}>
          Applicant pipeline
        </h3>
        <dl className={styles.pipeline}>
          {PIPELINE_ORDER.map((stage) => (
            <div key={stage} className={styles.pipelineCell}>
              <dt className={styles.pipelineLabel}>
                <Icon name={APPLICANT_STAGE_ICON[stage]} size={16} aria-hidden />
                <span>{APPLICANT_STAGE_LABEL[stage]}</span>
              </dt>
              <dd className={styles.pipelineValue}>{stages[stage]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Seeker preview</h3>
        <p className={styles.hint}>How this opportunity appears to seekers.</p>
        <DiscoveryCard
          data={toDiscoveryCardData(listing)}
          surface="discovery_feed"
          actions={<span className={styles.previewNote}>Preview only</span>}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Applicants</h3>
        {applicants.length > 0 ? (
          <ul className={styles.applicants}>
            {applicants.map((applicant) => (
              <li key={applicant.id} className={styles.applicant}>
                <div className={styles.applicantWho}>
                  <span className={styles.applicantName}>
                    {applicant.applicantName}
                  </span>
                  <span className={styles.applicantApplied}>
                    Applied {applicant.appliedOn}
                  </span>
                </div>
                <Badge
                  label={APPLICANT_STAGE_LABEL[applicant.stage]}
                  icon={APPLICANT_STAGE_ICON[applicant.stage]}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>No applicants yet for this listing.</p>
        )}
      </section>
    </div>
  );
}
