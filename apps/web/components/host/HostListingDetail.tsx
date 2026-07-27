"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, DiscoveryCard, Icon } from "@explore-and-earn/ui";

import {
  BenefitTrustModal,
  CATEGORY_LABEL,
  toDiscoveryCardData,
  type BenefitKind,
} from "../discovery";
import {
  APPLICANT_STAGE_ICON,
  APPLICANT_STAGE_LABEL,
  HOST_LISTING_STATE_ICON,
  HOST_LISTING_STATE_LABEL,
  countByStage,
  type ApplicantStage,
  type HostApplicantItem,
  type HostListingItem,
  type HostListingState,
} from "./models";
import { ListingStatusControls } from "./ListingStatusControls";

/** Map host listing management state to the canonical card state badge. */
function hostStateToCardState(
  state: HostListingState,
): "draft" | "filled" | "paused" | undefined {
  if (state === "draft") return "draft";
  if (state === "filled") return "filled";
  if (state === "closed") return "paused";
  return undefined;
}
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
  /**
   * The host's billing state, from hostAccountState() in @explore-and-earn/db.
   * Passed straight through to the status controls, which use it to explain the
   * plan requirement rather than to enforce it. See ListingStatusControls.
   */
  readonly accountState?: string | null;
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
  accountState,
}: HostListingDetailProps) {
  const { listing, state } = item;
  const stages = countByStage(applicants);
  const pipelineId = `pipeline-${listing.id}`;
  const [editBenefit, setEditBenefit] = useState<BenefitKind | null>(null);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{listing.title}</span>
          <span className={styles.meta}>
            {[
              CATEGORY_LABEL[listing.category],
              listing.location && listing.location !== "Location not specified"
                ? listing.location
                : null,
              listing.opportunityWindow,
            ]
              .filter(Boolean)
              .join(" · ")}
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

      {canEdit ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Listing status</h3>
          <p className={styles.hint}>
            You publish this listing yourself — there is no approval queue. A
            draft stays private until Housing, Meals and Pay are answered and
            you publish it.
          </p>
          <ListingStatusControls
            listingId={listing.id}
            currentStatus={listing.status}
            provenance={listing.provenanceInfo?.provenance}
            accountState={accountState}
          />
        </section>
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
          cardState={hostStateToCardState(state)}
          actions={<span className={styles.previewNote}>Preview only</span>}
          onHousingClick={() => setEditBenefit("housing")}
          onMealsClick={() => setEditBenefit("meals")}
        />
        <BenefitTrustModal
          mode="edit"
          open={editBenefit !== null}
          kind={editBenefit ?? "housing"}
          onClose={() => setEditBenefit(null)}
          listingId={listing.id}
          category={listing.category}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Applicants</h3>
        {applicants.length > 0 ? (
          <ul className={styles.applicants}>
            {applicants.map((applicant) => (
              <li key={applicant.id} className={styles.applicant}>
                <div className={styles.applicantWho}>
                  <Link
                    href={`/host/applicants/${applicant.id}`}
                    className={styles.applicantName}
                  >
                    {applicant.applicantName}
                  </Link>
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
