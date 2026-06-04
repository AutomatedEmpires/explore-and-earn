"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Icon, type IconKey } from "@explore-and-earn/ui";
import type { BenefitProvision } from "@explore-and-earn/contracts";

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

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const open = Boolean(listing && bucket);

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
	}, [open, onClose]);

	const meta = useMemo(() => (bucket ? BUCKET_META[bucket] : null), [bucket]);

	if (!mounted || !listing || !bucket || !meta) {
		return null;
	}

	const info = listing.benefits[bucket];

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
						<Icon name={meta.icon} size={16} aria-hidden />
						<span>{meta.label}</span>
					</span>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label={`Close ${meta.label.toLowerCase()} details`}
					>
						Close
					</Button>
				</div>

				<div className={styles.body}>
					<header className={styles.header}>
						<h2 id={titleId} className={styles.title}>
							{meta.label}
						</h2>
						<p className={styles.meta}>
							{listing.host.name} · {listing.location}
						</p>
					</header>

					<section
						className={styles.section}
						aria-label={`${meta.label} details`}
					>
						<h3 className={styles.sectionLabel}>{"What's provided"}</h3>
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
					</section>

					<section
						className={styles.section}
						aria-label={`${meta.label} photos`}
					>
						<h3 className={styles.sectionLabel}>Photos</h3>
						<div className={styles.empty}>
							<span className={styles.emptyIcon} aria-hidden>
								<Icon name={meta.icon} size={24} />
							</span>
							<p className={styles.emptyTitle}>{meta.emptyTitle}</p>
							<p className={styles.emptyBody}>{meta.emptyBody}</p>
						</div>
					</section>
				</div>
			</div>
		</div>,
		document.body,
	);
}
