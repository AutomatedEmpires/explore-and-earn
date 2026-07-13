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
		readonly slots: readonly string[];
	}
> = {
	housing: {
		label: "Housing",
		icon: "benefit.housing",
		slots: ["Bedroom", "Common", "Bath", "Misc"],
	},
	meals: {
		label: "Meals",
		icon: "benefit.meals",
		slots: ["Kitchen", "Prepared", "Dining", "Misc"],
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
				{/* The card's Housing/Meals cell now shows COLOR ONLY, so the
				    descriptor it used to carry lives here, as the lead. */}
				<div className={styles.summaryHead}>
					<span className={styles.summaryLabel}>
						<Icon name={meta.icon} size={16} aria-hidden />
						<span>What's provided</span>
					</span>
					<span className={styles.benefitProvision}>
						{PROVISION_LABEL[info.provision]}
					</span>
				</div>
				<p
					className={info.summary ? styles.descriptorLead : styles.descriptorMuted}
				>
					{info.summary ?? PROVISION_LABEL[info.provision]}
				</p>
				<p className={styles.verifyNote} role="note">
					<Icon name="system.info" size={16} aria-hidden />
					<span>Always verify accuracy with the host.</span>
				</p>
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
				aria-label={`${meta.label} photos`}
			>
				<h3 className={styles.sectionLabel}>Photos</h3>
				{/* Four honest slots. No photos are fabricated — each slot stays an
				    empty placeholder until the host uploads real media for it. */}
				<div className={styles.slotGrid}>
					{meta.slots.map((slotLabel) => (
						<div key={slotLabel} className={styles.slot}>
							<div className={styles.slotArea} aria-hidden>
								<Icon name={meta.icon} size={20} />
							</div>
							<span className={styles.slotLabel}>{slotLabel}</span>
						</div>
					))}
				</div>
				<p className={styles.noteText}>
					The host hasn&apos;t added {meta.label.toLowerCase()} photos yet. When they do, each slot fills in here.
				</p>
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
