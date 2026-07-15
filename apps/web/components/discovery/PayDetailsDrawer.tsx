"use client";

import { useMemo } from "react";
import { Button, Icon } from "@explore-and-earn/ui";
import { PopupShell } from "../overlay/PopupShell";

import { CATEGORY_ICON, type DiscoveryListing } from "./listing";
import {
	canOpenPayDetails,
	getPayBenchmarkState,
	getPayDetailsHeadline,
} from "./payDetailsState";
import styles from "./PayDetailsDrawer.module.css";

/** Minimum truthful listing shape required by the shared pay overlay. */
export type PayDetailsListing = Pick<
	DiscoveryListing,
	"category" | "benefits"
> &
	Partial<Pick<DiscoveryListing, "coverImageUrl" | "payInsight">>;

const CATEGORY_LABEL: Record<DiscoveryListing["category"], string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
};

const CATEGORY_RAIL: readonly DiscoveryListing["category"][] = [
	"seasonal",
	"maritime",
	"farm",
	"remote",
];

function benchmarkLabel(meterValue: number | undefined): string {
	if (typeof meterValue !== "number") return "Benchmark pending";
	if (meterValue >= 67) return "Above average";
	if (meterValue >= 34) return "Around average";
	return "Below average";
}

export interface PayDetailsDrawerProps {
	readonly listing: PayDetailsListing | null;
	readonly onClose: () => void;
}

export function PayDetailsDrawer({ listing, onClose }: PayDetailsDrawerProps) {
	const meterValue = useMemo(() => listing?.payInsight?.meterValue, [listing]);
	const payProvision = listing?.benefits.pay.provision ?? "not_provided";
	const benchmarkState = getPayBenchmarkState(payProvision, meterValue);
	const headlineAmount = getPayDetailsHeadline(listing?.benefits.pay.summary);
	const benchmarkText =
		listing && benchmarkState.hasBenchmark
			? `${benchmarkLabel(meterValue)} for ${CATEGORY_LABEL[listing.category]} roles`
			: benchmarkState.headline;
	const railCategories = useMemo<readonly DiscoveryListing["category"][]>(
		() =>
			listing?.category === "mix"
				? [...CATEGORY_RAIL, "mix"]
				: CATEGORY_RAIL,
		[listing],
	);

	if (!listing) {
		return null;
	}

	return (
		<PopupShell
			open={Boolean(listing)}
			onClose={onClose}
			title="Pay snapshot"
			headerIcon={<Icon name="benefit.pay" size={24} aria-hidden />}
			footer={
				<Button variant="primary" onClick={onClose} className={styles.ctaButton}>
					Got it
				</Button>
			}
			size="compact"
			closeLabel="Close pay details"
		>
			{/* Divider below chrome title */}
			<hr className={styles.rule} aria-hidden />

			{/* Benchmark headline — bare row, no card */}
			<div className={styles.snapshotHeadline} role="status" aria-label={benchmarkText}>
				<Icon name="status.match" size={16} aria-hidden />
				<span>{benchmarkText}</span>
			</div>

			{/* Pay card */}
			<section className={styles.payCard} aria-label="Listing pay benchmark card">
				<div className={styles.payHeroRow}>
					<div className={styles.payHeadlineBlock}>
						<p className={styles.amountValue}>{headlineAmount}</p>
						<p className={styles.amountLabel}>Listing pay</p>
					</div>
					<div className={styles.inlineArtwork} aria-hidden>
						{listing.coverImageUrl ? (
							<img
								className={styles.inlineArtworkImage}
								src={listing.coverImageUrl}
								alt=""
							/>
						) : (
							<div className={`${styles.inlineArtworkFallback} ${styles[listing.category]}`}>
								<Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />
							</div>
						)}
					</div>
				</div>

					{benchmarkState.hasBenchmark && typeof meterValue === "number" ? (
					<div className={styles.scaleWrap} aria-label={`Benchmark scale at ${meterValue}%`}>
						<div className={styles.scaleBand}>
							<div className={styles.scaleBar}>
								<span className={`${styles.scaleSegment} ${styles.scaleLow}`} />
								<span className={`${styles.scaleSegment} ${styles.scaleMid}`} />
								<span className={`${styles.scaleSegment} ${styles.scaleHigh}`} />
							</div>
							<span
								className={styles.scaleMarker}
								style={{ left: `${meterValue}%` }}
								aria-hidden
							>
								★
							</span>
						</div>
						<div className={styles.scaleLabels} aria-hidden>
							<span>Below Avg</span>
							<span>Average</span>
							<span>Above Avg</span>
						</div>
					</div>
					) : (
						<div className={styles.emptyState}>
							<span className={styles.emptyKicker}>
								{benchmarkState.emptyKicker}
							</span>
							<p className={styles.note}>
								{benchmarkState.emptyMessage}
							</p>
						</div>
					)}
				</section>

				{/* Category benchmark rail */}
				{benchmarkState.hasBenchmark ? (
					<>
						<div
							className={styles.categoryRail}
							role="list"
							aria-label="Category benchmarks"
						>
							{railCategories.map((category) => {
								const active = category === listing.category;
								return (
									<span
										key={category}
										role="listitem"
										className={
											active
												? `${styles.categoryChip} ${styles.categoryChipActive}`
												: styles.categoryChip
										}
									>
										{active ? (
											<Icon name={CATEGORY_ICON[category]} size={16} aria-hidden />
										) : null}
										{CATEGORY_LABEL[category]}
									</span>
								);
							})}
						</div>

						{/* Benchmark source note */}
						<div className={styles.benchmarkNote}>
							<Icon name="system.info" size={16} aria-hidden />
							<p className={styles.caption}>
								Benchmarks are based on similar Explore &amp; Earn listings.
							</p>
						</div>
					</>
				) : null}

			{listing.payInsight?.note ? (
				<div className={styles.noteCard}>
					<p className={styles.note}>{listing.payInsight.note}</p>
				</div>
			) : null}

			{/* Disclaimer */}
				{canOpenPayDetails(payProvision) ? (
					<div className={styles.disclaimer} role="note">
						<Icon name="system.info" size={16} aria-hidden />
						<p className={styles.disclaimerText}>
							Pay ranges are host-provided estimates and not guaranteed. Confirm exact compensation directly with the host before accepting.
						</p>
					</div>
				) : null}
		</PopupShell>
	);
}
