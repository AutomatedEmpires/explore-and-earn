"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
		readonly variant: "seasonal" | "featured" | "boosted";
	}
> = {
	seasonal: { label: "Seasonal", icon: "category.seasonal", variant: "seasonal" },
	featured: {
		label: "Featured",
		icon: "trust.featured_employer",
		variant: "featured",
	},
	boosted: { label: "Boosted", icon: "status.boosted", variant: "boosted" },
};

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!listing) {
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
	}, [listing, onClose]);

	const conditionalBadges = useMemo(
		() => listing?.conditionalBadges ?? [],
		[listing],
	);

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
						<Icon name={CATEGORY_ICON[listing.category]} size={16} aria-hidden />
						<span>{CATEGORY_LABEL[listing.category]}</span>
					</span>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close opportunity details"
					>
						Close
					</Button>
				</div>

				<div className={styles.cover} aria-hidden={true}>
					<Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />
				</div>

				<div className={styles.body}>
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

					<header className={styles.header}>
						<h2 id={titleId} className={styles.title}>
							{listing.title}
						</h2>
						<p className={styles.meta}>
							{listing.host.name} \u00b7 {listing.location} \u00b7{" "}
							{listing.opportunityWindow}
						</p>
					</header>

					{listing.founding ? (
						<p className={styles.founding}>Founding program opportunity</p>
					) : null}

					<section className={styles.section} aria-label="What is provided">
						<h3 className={styles.sectionLabel}>Housing \u00b7 Meals \u00b7 Pay</h3>
						<dl className={styles.triad}>
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

					{typeof listing.matchScore === "number" ? (
						<div className={styles.match}>
							<Meter value={listing.matchScore} label="Match" />
						</div>
					) : null}

					<div className={styles.footer}>
						<Button variant="secondary" icon="action.save">
							Save
						</Button>
						<Button variant="primary" icon="action.apply">
							Quick Apply
						</Button>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
