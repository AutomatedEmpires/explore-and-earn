"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Icon, type IconKey } from "@explore-and-earn/ui";
import { PopupShell } from "../overlay/PopupShell";

import { CATEGORY_ICON, CATEGORY_LABEL, type DiscoveryListing } from "./listing";
import styles from "./ReportListingDrawer.module.css";

interface ReportReason {
	readonly id: string;
	readonly label: string;
	readonly icon: IconKey;
}

const REPORT_REASONS: readonly ReportReason[] = [
	{ id: "unsafe", label: "Safety concern", icon: "system.warning" },
	{ id: "inaccurate", label: "Misleading details", icon: "system.info" },
	{ id: "scam", label: "Scam or spam", icon: "action.report" },
	{ id: "inappropriate", label: "Inappropriate content", icon: "action.message" },
	{ id: "housing_pay", label: "Housing or pay issue", icon: "benefit.housing" },
	{ id: "other", label: "Other", icon: "system.info" },
];

const REPORT_REASON_SHORT: Record<string, string> = {
	inaccurate: "Inaccurate",
	unsafe: "Unsafe",
	scam: "Scam",
	inappropriate: "Inappropriate",
	housing_pay: "Housing or pay",
	other: "Other",
};

const REPORT_ICON: IconKey = "action.report";
const CONFIRM_ICON: IconKey = "system.success";

export interface ReportListingDrawerProps {
	readonly listing: DiscoveryListing | null;
	readonly onClose: () => void;
}

/**
 * ReportListingDrawer — lane-local overlay for the card's report flag
 * (DiscoveryCard.onReport) on the Seek + Map surfaces. Collects a reason +
 * optional detail and shows a confirmation state.
 *
 * Mirrors QuickPeekDrawer exactly (own portal, scrim, focus trap, escape-to-
 * close, body-scroll lock, reduced-motion) rather than the frozen Modal stub,
 * so the seeker lane stays unblocked. Sprint Zero is UI-only: no backend or
 * persistence yet — the report is captured client-side and the confirmation
 * represents the intended end state, ready to wire to the moderation pipeline.
 */
export function ReportListingDrawer({
	listing,
	onClose,
}: ReportListingDrawerProps) {
	const [reason, setReason] = useState<string | null>(null);
	const [detail, setDetail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	const open = Boolean(listing);

	useEffect(() => {
		if (listing) {
			setReason(null);
			setDetail("");
			setSubmitted(false);
		}
	}, [listing]);

	if (!listing) {
		return null;
	}

	return (
		<PopupShell
			open={open}
			onClose={onClose}
			title={submitted ? "Report noted" : "Report listing"}
			headerIcon={<Icon name={REPORT_ICON} size={24} aria-hidden />}
			eyebrow={
				<>
					<Icon name="system.info" size={16} aria-hidden />
					<span>Safety & moderation</span>
				</>
			}
			headerMeta={
				<span className={styles.headerCopy}>
					{submitted
						? "Your report has been captured for manual review."
						: "Help us keep Explore & Earn safe. Select a reason for reporting this listing."}
				</span>
			}
			headerTags={
				<Badge
					label={CATEGORY_LABEL[listing.category]}
					icon={CATEGORY_ICON[listing.category]}
				/>
			}
			footer={
				submitted ? (
					<div className={styles.footer}>
						<Button variant="primary" onClick={onClose}>
							Done
						</Button>
					</div>
				) : (
					<div className={styles.footer}>
						<Button variant="secondary" onClick={onClose}>
							Cancel
						</Button>
						<Button
							variant="primary"
							onClick={() => setSubmitted(true)}
							disabled={reason === null}
						>
							Submit report
						</Button>
					</div>
				)
			}
			size="compact"
			closeLabel="Close report"
		>
			{submitted ? (
				<div className={styles.confirm}>
					<span className={styles.confirmIcon} aria-hidden>
						<Icon name={CONFIRM_ICON} size={24} />
					</span>
					<h2 className={styles.confirmTitle}>Report noted</h2>
					<p className={styles.confirmBody}>
						Your feedback has been captured. Moderation review is handled manually — we will follow up if action is taken.
					</p>
					<div className={styles.confirmMetaRow}>
						<span className={styles.confirmMetaChip}>{reason ? REPORT_REASON_SHORT[reason] : "Reason captured"}</span>
						<span className={styles.confirmMetaChip}>{listing.host.name}</span>
					</div>
				</div>
			) : (
				<>
					<section className={styles.summaryCard} aria-label="Listing summary">
						<div className={styles.summaryThumb} aria-hidden>
							{listing.coverImageUrl ? (
								<img className={styles.summaryThumbImage} src={listing.coverImageUrl} alt="" />
							) : (
								<div className={styles.summaryThumbFallback}>
									<Icon name={CATEGORY_ICON[listing.category]} size={20} aria-hidden />
								</div>
							)}
						</div>
						<div className={styles.summaryContent}>
							<h3 className={styles.summaryTitle}>{listing.title}</h3>
							<p className={styles.summaryMeta}>{listing.location}</p>
						</div>
					</section>

					<fieldset className={styles.fieldset}>
							<legend className={styles.legend}>
							Select a reason
							</legend>
							<div className={styles.options}>
								{REPORT_REASONS.map((option) => (
									<label
										key={option.id}
										className={
											reason === option.id
												? `${styles.option} ${styles.optionActive}`
												: styles.option
										}
									>
										<input
											type="radio"
											name="report-reason"
											value={option.id}
											checked={reason === option.id}
											onChange={() => setReason(option.id)}
										/>
										<span className={styles.optionIcon} aria-hidden>
											<Icon name={option.icon} size={24} aria-hidden />
										</span>
										<span className={styles.optionLabel}>{option.label}</span>
									</label>
								))}
							</div>
						</fieldset>

					<label className={styles.detail}>
							<span className={styles.detailLabel}>Additional description (optional)</span>
							<textarea
								className={styles.detailInput}
								value={detail}
								onChange={(event) => setDetail(event.target.value)}
								rows={4}
								placeholder="Provide any additional details that can help us review this report..."
							/>
					</label>
				</>
				)}
		</PopupShell>
	);
}
