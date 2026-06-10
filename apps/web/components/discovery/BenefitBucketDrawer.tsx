"use client";

import { useMemo } from "react";
import {
	Button,
	Icon,
	type IconKey,
} from "@explore-and-earn/ui";
import type { BenefitProvision } from "@explore-and-earn/contracts";
import { PopupShell } from "../overlay/PopupShell";

import { type DiscoveryListing } from "./listing";
import styles from "./BenefitBucketDrawer.module.css";

/** The two benefit cells that open an evidence photo bucket (Pay never does). */
export type BenefitBucket = "housing" | "meals";

const BUCKET_META: Record<
	BenefitBucket,
	{
		readonly label: string;
		readonly icon: IconKey;
		readonly emptyTitle: string;
		readonly emptyBody: string;
	}
> = {
	housing: {
		label: "Housing",
		icon: "benefit.housing",
		emptyTitle: "No housing photos yet",
		emptyBody:
			"This host hasn't added photos of the housing yet. When they do, they'll appear here.",
	},
	meals: {
		label: "Meals",
		icon: "benefit.meals",
		emptyTitle: "No meal photos yet",
		emptyBody:
			"This host hasn't added photos of the meals yet. When they do, they'll appear here.",
	},
};

const PROVISION_LABEL: Record<BenefitProvision, string> = {
	provided: "Provided",
	partial: "Partial",
	not_provided: "Not provided",
};

export interface BenefitBucketDrawerProps {
	readonly listing: DiscoveryListing | null;
	readonly bucket: BenefitBucket | null;
	readonly onClose: () => void;
}

/**
 * BenefitBucketDrawer — lane-local detail overlay for a single benefit's
 * "evidence photo bucket" (Housing or Meals), opened from the card's
 * onHousingClick / onMealsClick on the Seek + Map surfaces.
 *
 * Mirrors QuickPeekDrawer exactly (own portal, scrim, focus trap, escape-to-
 * close, body-scroll lock, reduced-motion) rather than the frozen Modal
 * primitive, so the seeker lane stays unblocked. Sprint Zero is honest: it
 * surfaces the REAL provision + summary for the benefit, and the evidence
 * photo bucket shows a truthful empty state until user uploads (ListingMedia)
 * land — never fabricated imagery.
 */
export function BenefitBucketDrawer({
	listing,
	bucket,
	onClose,
}: BenefitBucketDrawerProps) {
	const open = Boolean(listing && bucket);

	const meta = useMemo(() => (bucket ? BUCKET_META[bucket] : null), [bucket]);

	if (!listing || !bucket || !meta) {
		return null;
	}

	const info = listing.benefits[bucket];

	if (info.provision === "not_provided") {
		return null;
	}

	return (
		<PopupShell
			open={open}
			onClose={onClose}
			title={`${meta.label} details`}
			headerIcon={<Icon name={meta.icon} size={24} aria-hidden />}
			headerMeta={<span>{listing.host.name} · {listing.location}</span>}
			hero={
				listing.coverImageUrl ? (
					<img className={styles.heroImage} src={listing.coverImageUrl} alt="" />
				) : (
					<div className={styles.heroFallback} aria-hidden>
						<Icon name={meta.icon} size={24} aria-hidden />
						<span>{meta.label}</span>
					</div>
				)
			}
			heroFooter={
				<div className={styles.heroBadge}>
					<span className={styles.heroBadgeLabel}>
						{PROVISION_LABEL[info.provision]}
					</span>
				</div>
			}
			footer={
				<div className={styles.footer}>
					<Button variant="secondary" onClick={onClose}>
						Close
					</Button>
				</div>
			}
			size="compact"
			closeLabel={`Close ${meta.label.toLowerCase()} details`}
		>
			<section className={styles.summaryCard} aria-label={`${meta.label} summary`}>
				<span className={styles.summaryLabel}>What's provided</span>
				<div className={styles.benefit}>
					<div className={styles.benefitHead}>
						<span className={styles.benefitLabel}>
							<Icon name={meta.icon} size={16} aria-hidden />
							<span>{meta.label}</span>
						</span>
						<span className={styles.benefitProvision}>
							{PROVISION_LABEL[info.provision]}
						</span>
					</div>
					<p className={styles.benefitValue}>
						{info.summary ?? PROVISION_LABEL[info.provision]}
					</p>
				</div>
				<div className={styles.factGrid}>
					<div className={styles.factCard}>
						<span className={styles.factLabel}>Listing</span>
						<p className={styles.factValue}>{listing.title}</p>
					</div>
					<div className={styles.factCard}>
						<span className={styles.factLabel}>Status</span>
						<p className={styles.factValue}>{PROVISION_LABEL[info.provision]}</p>
					</div>
				</div>
			</section>

			<section
				className={styles.section}
				aria-label={`${meta.label} evidence`}
			>
				<h3 className={styles.sectionLabel}>Evidence bucket</h3>
				<div className={styles.empty}>
					<span className={styles.emptyIcon} aria-hidden>
						<Icon name={meta.icon} size={24} />
					</span>
					<span className={styles.emptyKicker}>No uploaded media yet</span>
					<p className={styles.emptyTitle}>{meta.emptyTitle}</p>
					<p className={styles.emptyBody}>{meta.emptyBody}</p>
				</div>
				<div className={styles.noteCard}>
					<p className={styles.noteText}>
						Only listing-specific {meta.label.toLowerCase()} uploads belong here. This drawer stays empty until that exact evidence exists.
					</p>
				</div>
			</section>

			<div className={styles.disclaimer} role="note">
				<Icon name="system.info" size={16} aria-hidden />
				<p className={styles.disclaimerText}>
					Photos and details shown are provided by the host and are not verified or guaranteed by Explore &amp; Earn. Confirm arrangements directly with the host before accepting.
				</p>
			</div>
		</PopupShell>
	);
}
