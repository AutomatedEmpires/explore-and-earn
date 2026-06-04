"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Icon, type IconKey } from "@explore-and-earn/ui";

import { type DiscoveryListing } from "./listing";
import styles from "./ReportListingDrawer.module.css";

interface ReportReason {
	readonly id: string;
	readonly label: string;
}

const REPORT_REASONS: readonly ReportReason[] = [
	{ id: "inaccurate", label: "Inaccurate or misleading" },
	{ id: "unsafe", label: "Unsafe or exploitative" },
	{ id: "scam", label: "Scam or fraud" },
	{ id: "inappropriate", label: "Inappropriate content" },
	{ id: "other", label: "Something else" },
];

const REPORT_ICON: IconKey = "action.report";
const CONFIRM_ICON: IconKey = "system.info";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const [mounted, setMounted] = useState(false);
	const [reason, setReason] = useState<string | null>(null);
	const [detail, setDetail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const open = Boolean(listing);

	useEffect(() => {
		if (listing) {
			setReason(null);
			setDetail("");
			setSubmitted(false);
		}
	}, [listing]);

	useEffect(() => {
		if (!open) {
			return;
		}
		restoreFocusRef.current = document.activeElement as HTMLElement | null;
		const panel = panelRef.current;
		const focusables = () =>
			panel
				? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
				: [];
		focusables()[0]?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			if (event.key !== "Tab") {
				return;
			}
			const items = focusables();
			if (items.length === 0) {
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = previousOverflow;
			restoreFocusRef.current?.focus();
		};
	}, [open, submitted, onClose]);

	if (!mounted || !listing) {
		return null;
	}

	return createPortal(
		<div
			className={styles.scrim}
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div
				ref={panelRef}
				className={styles.panel}
				role="dialog"
				aria-modal={true}
				aria-labelledby={titleId}
			>
				<div className={styles.topbar}>
					<span className={styles.eyebrow}>
						<Icon name={REPORT_ICON} size={16} aria-hidden />
						<span>Report listing</span>
					</span>
					<Button variant="ghost" onClick={onClose} aria-label="Close report">
						Close
					</Button>
				</div>

				{submitted ? (
					<div className={styles.body}>
						<div className={styles.confirm}>
							<span className={styles.confirmIcon} aria-hidden>
								<Icon name={CONFIRM_ICON} size={24} />
							</span>
							<h2 id={titleId} className={styles.confirmTitle}>
								Report received
							</h2>
							<p className={styles.confirmBody}>
								Thanks for flagging this listing. Our team will review it and
								take action if it breaks the rules.
							</p>
							<Button variant="primary" onClick={onClose}>
								Done
							</Button>
						</div>
					</div>
				) : (
					<div className={styles.body}>
						<header className={styles.header}>
							<h2 id={titleId} className={styles.title}>
								Report this listing
							</h2>
							<p className={styles.meta}>
								{listing.host.name} · {listing.location}
							</p>
						</header>

						<fieldset className={styles.fieldset}>
							<legend className={styles.legend}>
								Why are you reporting this?
							</legend>
							<div className={styles.options}>
								{REPORT_REASONS.map((option) => (
									<label key={option.id} className={styles.option}>
										<input
											type="radio"
											name="report-reason"
											value={option.id}
											checked={reason === option.id}
											onChange={() => setReason(option.id)}
										/>
										<span>{option.label}</span>
									</label>
								))}
							</div>
						</fieldset>

						<label className={styles.detail}>
							<span className={styles.detailLabel}>Add details (optional)</span>
							<textarea
								className={styles.detailInput}
								value={detail}
								onChange={(event) => setDetail(event.target.value)}
								rows={3}
								placeholder="What should we know?"
							/>
						</label>

						<div className={styles.footer}>
							<Button
								variant="primary"
								onClick={() => setSubmitted(true)}
								disabled={reason === null}
							>
								Submit report
							</Button>
							<Button variant="ghost" onClick={onClose}>
								Cancel
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
}
