"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
	Badge,
	Button,
	Icon,
	Meter,
	VerifiedHostBadge,
	type IconKey,
} from "@explore-and-earn/ui";
import type {
	BenefitProvision,
	DiscoveryCardConditionalBadge,
} from "@explore-and-earn/contracts";
import { saveListingAction } from "../../app/actions/swipe";
import { PopupShell } from "../overlay/PopupShell";

import { CATEGORY_ICON, CATEGORY_LABEL, type DiscoveryListing } from "./listing";
import styles from "./QuickPeekDrawer.module.css";

type BenefitKey = "housing" | "meals" | "pay";

const BENEFIT_META: readonly {
	readonly key: BenefitKey;
	readonly label: string;
	readonly icon: IconKey;
}[] = [
	{ key: "housing", label: "Housing", icon: "benefit.housing" },
	{ key: "meals", label: "Meals", icon: "benefit.meals" },
	{ key: "pay", label: "Pay", icon: "benefit.pay" },
];

const PROVISION_LABEL: Record<BenefitProvision, string> = {
	provided: "Provided",
	partial: "Partial",
	not_provided: "Not provided",
};

const CONDITIONAL_BADGE_META: Record<
	DiscoveryCardConditionalBadge,
	{
		readonly label: string;
		readonly icon: IconKey;
		readonly variant: "seasonal" | "boosted";
	}
> = {
	seasonal: { label: "Seasonal", icon: "category.seasonal", variant: "seasonal" },
	boosted: { label: "Boosted", icon: "status.boosted", variant: "boosted" },
};
export interface QuickPeekDrawerProps {
	readonly listing: DiscoveryListing | null;
	readonly onClose: () => void;
}

/**
 * QuickPeekDrawer \u2014 lane-local detail overlay for a single DiscoveryListing.
 *
 * Opened from DiscoveryCard.onOpen on the Seek tab. Deliberately does NOT use
 * the shared (frozen) Modal primitive: it owns its own portal, scrim, focus
 * trap, escape-to-close, body-scroll lock, and reduced-motion handling so the
 * seeker lane stays unblocked without editing foundation code. Read-only peek:
 * Save / Quick Apply remain presentational until the data layer lands.
 */
export function QuickPeekDrawer({ listing, onClose }: QuickPeekDrawerProps) {
	const router = useRouter();
	const [saved, setSaved] = useState(false);
	const [saving, setSaving] = useState(false);

	const conditionalBadges = useMemo(
		() => listing?.conditionalBadges ?? [],
		[listing],
	);
	const signals = useMemo(
		() =>
			[
				listing?.founding ? "Founding program" : null,
				listing?.visaSupport ? "Visa support" : null,
			].filter((value): value is string => value !== null),
		[listing],
	);
	const windowFacts = useMemo(
		() =>
			listing?.begins && listing?.ends
				? [
					{ label: "Begins", value: listing.begins },
					{ label: "Ends", value: listing.ends },
				]
				: listing
					? [{ label: "Window", value: listing.opportunityWindow }]
					: [],
		[listing],
	);

	async function handleSave() {
		if (!listing || saved || saving) return;
		setSaving(true);
		const result = await saveListingAction(listing.id).catch(() => ({ ok: false, alreadySaved: false }));
		setSaving(false);
		if (result.ok || result.alreadySaved) {
			setSaved(true);
		}
	}

	function handleApply() {
		if (!listing) return;
		router.push(`/listing/${listing.id}`);
		onClose();
	}

	if (!listing) {
		return null;
	}

	return (
		<PopupShell
			open={Boolean(listing)}
			onClose={onClose}
			title={listing.title}
			headerIcon={<Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />}
			eyebrow={
				<>
					<Icon name="action.forward" size={16} aria-hidden />
					<span>Quick peek</span>
				</>
			}
			headerMeta={
				<span>
					{listing.host.name} · {listing.location} · {listing.opportunityWindow}
				</span>
			}
			headerTags={
				<div className={styles.badges}>
					<Badge
						label={CATEGORY_LABEL[listing.category]}
						icon={CATEGORY_ICON[listing.category]}
					/>
					{listing.host.verified ? <VerifiedHostBadge /> : null}
					{conditionalBadges.map((badge) => (
						<Badge
							key={badge}
							label={CONDITIONAL_BADGE_META[badge].label}
							icon={CONDITIONAL_BADGE_META[badge].icon}
							variant={CONDITIONAL_BADGE_META[badge].variant}
						/>
					))}
				</div>
			}
			hero={
				<div className={styles.cover}>
					{listing.coverImageUrl ? (
						<img
							className={styles.coverImage}
							src={listing.coverImageUrl}
							alt=""
						/>
					) : (
						<div className={styles.coverFallback} aria-hidden={true}>
							<Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />
							<span>{CATEGORY_LABEL[listing.category]}</span>
						</div>
					)}
				</div>
			}
			heroFooter={
				<div className={styles.heroBadge}>
					<span className={styles.heroBadgeLabel}>{listing.host.name}</span>
				</div>
			}
			footer={
				<div className={styles.footer}>
					<Button
						variant="secondary"
						icon="action.save"
						onClick={handleSave}
						disabled={saved || saving}
					>
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
					<Button variant="primary" icon="action.apply" onClick={handleApply}>
						View &amp; Apply
					</Button>
				</div>
			}
			closeLabel="Close opportunity details"
		>
			{signals.length > 0 ? (
				<section className={styles.section} aria-label="Opportunity signals">
					<h3 className={styles.sectionLabel}>Signals</h3>
					<div className={styles.signalRail}>
						{signals.map((signal) => (
							<span key={signal} className={styles.signalChip}>
								{signal}
							</span>
						))}
					</div>
				</section>
			) : null}

			<section className={styles.overviewCard} aria-label="Opportunity summary card">
				<div className={styles.infoStack}>
					<div className={styles.infoRow}>
						<Icon name="action.apply" size={16} aria-hidden />
						<span>{listing.title}</span>
					</div>
					<div className={styles.infoRow}>
						<Icon name="nav.map" size={16} aria-hidden />
						<span>{listing.location}</span>
					</div>
				</div>

				<div className={styles.dateRail}>
					{windowFacts.map((fact) => (
						<div key={fact.label} className={styles.dateCard}>
							<span className={styles.dateLabel}>{fact.label}</span>
							<p className={styles.dateValue}>{fact.value}</p>
						</div>
					))}
				</div>

				<dl className={styles.triadGrid}>
							{BENEFIT_META.map(({ key, label, icon }) => {
								const info = listing.benefits[key];
								return (
									<div key={key} className={styles.benefit}>
										<div className={styles.benefitHead}>
											<dt className={styles.benefitLabel}>
												<Icon name={icon} size={16} aria-hidden />
												<span>{label}</span>
											</dt>
											<span className={styles.benefitProvision}>
												{PROVISION_LABEL[info.provision]}
											</span>
										</div>
										<dd className={styles.benefitValue}>
											{info.summary ?? PROVISION_LABEL[info.provision]}
										</dd>
									</div>
								);
							})}
					</dl>
			</section>

			{listing.payInsight?.note ? (
				<section className={styles.section} aria-label="Compensation note">
					<h3 className={styles.sectionLabel}>Compensation note</h3>
					<div className={styles.noteCard}>
						<p className={styles.noteText}>{listing.payInsight.note}</p>
					</div>
				</section>
			) : null}

			{typeof listing.matchScore === "number" ? (
				<div className={styles.match}>
					<Meter value={listing.matchScore} label="Match" />
				</div>
			) : null}
		</PopupShell>
	);
}
