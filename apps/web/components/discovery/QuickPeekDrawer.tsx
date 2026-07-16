"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon, type IconKey } from "@explore-and-earn/ui";
import {
	NOT_STATED_LABEL,
	SOURCED_DISCLOSURE_LABEL,
	type BenefitProvision,
} from "@explore-and-earn/contracts";
import { saveListingAction } from "../../app/actions/swipe";
import { recordSourceClickAction } from "../../app/actions/sourcedAnalytics";
import { PopupShell } from "../overlay/PopupShell";
import { CATEGORY_ICON, CATEGORY_LABEL, type DiscoveryListing } from "./listing";
import styles from "./QuickPeekDrawer.module.css";

const PROVISION_LABEL: Record<BenefitProvision, string> = {
	provided:     "Included",
	partial:      "Partial",
	not_provided: "Not included",
};

interface BenefitChipProps {
	icon: IconKey;
	label: string;
	value: string;
	provision: BenefitProvision;
	/** Sourced listing: the source didn't state this — neutral, not red. */
	notStated?: boolean;
}

function BenefitChip({ icon, label, value, provision, notStated }: BenefitChipProps) {
	const cls =
		label === "Pay"
			? styles.chipPay
			: notStated
				? styles.chipNeutral
				: provision === "provided" || provision === "partial"
					? styles.chipGreen
					: styles.chipRed;
	return (
		<div className={`${styles.chip} ${cls}`}>
			<Icon name={icon} size={16} aria-hidden />
			<span className={styles.chipLabel}>{label}</span>
			<span className={styles.chipValue}>{notStated ? NOT_STATED_LABEL : value}</span>
		</div>
	);
}

export interface QuickPeekDrawerProps {
	readonly listing: DiscoveryListing | null;
	readonly onClose: () => void;
}

export function QuickPeekDrawer({ listing, onClose }: QuickPeekDrawerProps) {
	const router = useRouter();
	const [saved, setSaved] = useState(false);
	const [saving, setSaving] = useState(false);

	const signals = useMemo(
		() => [
			listing?.founding ? "Founding program" : null,
			listing?.visaSupport ? "Visa support" : null,
		].filter((v): v is string => v !== null),
		[listing],
	);

	async function handleSave() {
		if (!listing || saved || saving) return;
		setSaving(true);
		const result = await saveListingAction(listing.id).catch(() => ({ ok: false, alreadySaved: false }));
		setSaving(false);
		if (result.ok || result.alreadySaved) setSaved(true);
	}

	function handleApply() {
		if (!listing) return;
		router.push(`/listing/${listing.id}`);
		onClose();
	}

	if (!listing) return null;

	const hp = listing.benefits.housing.provision;
	const mp = listing.benefits.meals.provision;
	const pp = listing.benefits.pay.provision;

	const payValue     = listing.benefits.pay.summary     ?? PROVISION_LABEL[pp];
	const housingValue = listing.benefits.housing.summary ?? PROVISION_LABEL[hp];
	const mealsValue   = listing.benefits.meals.summary   ?? PROVISION_LABEL[mp];

	const provenance = listing.provenanceInfo;
	const isSourced = provenance?.provenance === "sourced";
	const evidence = provenance?.benefitEvidence;

	return (
		<PopupShell
			open={Boolean(listing)}
			onClose={onClose}
			title={listing.title}
			size="compact"
			headerIcon={<Icon name={CATEGORY_ICON[listing.category]} size={20} aria-hidden />}
			headerMeta={
				<span>{listing.host.name} · {listing.location}</span>
			}
			footer={
				<div className={styles.footer}>
					<Button variant="secondary" icon="action.save" onClick={handleSave} disabled={saved || saving}>
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
					<Button variant="primary" icon="action.apply" onClick={handleApply}>
						View &amp; Apply
					</Button>
				</div>
			}
			closeLabel="Close opportunity details"
		>
			{/* Sourced disclosure + attribution — first, honest, unmissable. */}
			{isSourced ? (
				<div className={styles.sourcedNote}>
					<Icon name="system.info" size={16} aria-hidden />
					<div>
						<strong>{SOURCED_DISCLOSURE_LABEL}</strong>
						{provenance?.source?.sourceName ? (
							<span className={styles.sourceLine}>
								From {provenance.source.sourceName}
								{provenance.source.employerName ? ` · ${provenance.source.employerName}` : ""}
							</span>
						) : null}
						{provenance?.source?.sourceUrl ? (
							<a
								className={styles.sourceLink}
								href={provenance.source.sourceUrl}
								target="_blank"
								rel="noopener noreferrer nofollow"
								onClick={() => {
									// Fire-and-forget analytics; never block navigation.
									void recordSourceClickAction(listing.id);
								}}
							>
								View original posting
								<Icon name="action.forward" size={14} aria-hidden />
							</a>
						) : null}
					</div>
				</div>
			) : null}

			{/* Dates */}
			<div className={styles.dateRow}>
				<div className={styles.dateCell}>
					<Icon name="status.begins" size={16} aria-hidden />
					<span className={styles.dateMeta}>Begins</span>
					<span className={styles.dateVal}>{listing.begins ?? "Flexible"}</span>
				</div>
				<div className={styles.dateDivider} aria-hidden />
				<div className={styles.dateCell}>
					<Icon name="status.ends" size={16} aria-hidden />
					<span className={styles.dateMeta}>Ends</span>
					<span className={styles.dateVal}>{listing.ends ?? "Open"}</span>
				</div>
			</div>

			{/* Benefit triad — evidence-aware: a not_stated benefit is neutral. */}
			<div className={styles.triad}>
				<BenefitChip icon="benefit.housing" label="Housing" value={housingValue} provision={hp} notStated={evidence?.housing === "not_stated"} />
				<BenefitChip icon="benefit.meals"   label="Meals"   value={mealsValue}   provision={mp} notStated={evidence?.meals === "not_stated"} />
				<BenefitChip icon="benefit.pay"     label="Pay"     value={payValue}     provision={pp} notStated={evidence?.pay === "not_stated"} />
			</div>

			{/* Pay note — single line, no card wrapper */}
			{listing.payInsight?.note ? (
				<p className={styles.note}>
					<Icon name="benefit.pay" size={16} aria-hidden />
					{listing.payInsight.note}
				</p>
			) : null}

			{/* Signals — inline pills, no section heading */}
			{signals.length > 0 ? (
				<div className={styles.signals}>
					{signals.map((s) => (
						<span key={s} className={styles.signalPill}>{s}</span>
					))}
				</div>
			) : null}

			{/* Category tag */}
			<div className={styles.catRow}>
				<Icon name={CATEGORY_ICON[listing.category]} size={16} aria-hidden />
				<span className={styles.catLabel}>{CATEGORY_LABEL[listing.category]}</span>
				<span className={styles.catDot} aria-hidden>·</span>
				<span className={styles.catLabel}>{listing.opportunityWindow}</span>
			</div>
		</PopupShell>
	);
}
