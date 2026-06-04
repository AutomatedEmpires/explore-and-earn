"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	type DiscoveryListing,
	type DiscoveryListingHost,
} from "./listing";
import styles from "./HostProfilePopup.module.css";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface HostProfilePopupProps {
	/** The host whose profile to show, or null when closed. */
	readonly host: DiscoveryListingHost | null;
	/** All discoverable listings; the popup surfaces this host's open roles from them. */
	readonly listings: readonly DiscoveryListing[];
	readonly onClose: () => void;
	/** Open one of the host's roles (chains into the lane's QuickPeekDrawer). */
	readonly onSelectListing?: (id: string) => void;
}

/**
 * HostProfilePopup \u2014 lane-local host (or seeker) identity overlay.
 *
 * Opened from DiscoveryCard.onHostClick (the identity circle). Mirrors the
 * QuickPeekDrawer contract: it owns its own portal, scrim, focus trap,
 * escape-to-close, body-scroll lock, and reduced-motion handling rather than
 * touching the frozen Modal primitive, so the seeker lane stays unblocked.
 *
 * Sprint Zero is fixture-backed and honest: it shows only data we actually
 * have \u2014 the host name, the self-declared verified badge (G22 qualifier
 * "Self-Declared by Host"), and this host's open opportunities. No bio,
 * ratings, or history are invented; richer host profiles arrive with the data
 * layer behind this same component contract.
 */
export function HostProfilePopup({
	host,
	listings,
	onClose,
	onSelectListing,
}: HostProfilePopupProps) {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!host) {
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
	}, [host, onClose]);

	const hostListings = useMemo(
		() =>
			host
				? listings.filter((listing) => listing.host.name === host.name)
				: [],
		[host, listings],
	);

	if (!mounted || !host) {
		return null;
	}

	const roleWord = hostListings.length === 1 ? "opportunity" : "opportunities";
	const trustNote = host.verified
		? "This host has a verified badge. Verification is self-declared by the host."
		: "This host hasn't added a verified badge yet.";

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
						<Icon name="nav.profile" size={16} aria-hidden />
						<span>Host profile</span>
					</span>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close host profile"
					>
						Close
					</Button>
				</div>

				<div className={styles.body}>
					<header className={styles.identity}>
						<span className={styles.avatar} aria-hidden>
							<Icon name="nav.profile" size={24} aria-hidden />
						</span>
						<div className={styles.identityText}>
							<h2 id={titleId} className={styles.name}>
								{host.name}
							</h2>
							{host.verified ? <VerifiedHostBadge /> : null}
						</div>
					</header>

					<p className={styles.trust}>{trustNote}</p>

					<section
						className={styles.section}
						aria-label="Open opportunities from this host"
					>
						<h3 className={styles.sectionLabel}>
							{hostListings.length} open {roleWord}
						</h3>
						<ul className={styles.list}>
							{hostListings.map((listing) =>
								onSelectListing ? (
									<li key={listing.id}>
										<button
											type="button"
											className={styles.role}
											onClick={() => onSelectListing(listing.id)}
										>
											<Icon
												name={CATEGORY_ICON[listing.category]}
												size={20}
												aria-hidden
											/>
											<span className={styles.roleText}>
												<span className={styles.roleTitle}>{listing.title}</span>
												<span className={styles.roleMeta}>
													{CATEGORY_LABEL[listing.category]} \u00b7 {listing.location}{" "}
													\u00b7 {listing.opportunityWindow}
												</span>
											</span>
											<Icon name="action.forward" size={20} aria-hidden />
										</button>
									</li>
								) : (
									<li key={listing.id} className={styles.role}>
										<Icon
											name={CATEGORY_ICON[listing.category]}
											size={20}
											aria-hidden
										/>
										<span className={styles.roleText}>
											<span className={styles.roleTitle}>{listing.title}</span>
											<span className={styles.roleMeta}>
												{CATEGORY_LABEL[listing.category]} \u00b7 {listing.location}{" "}
												\u00b7 {listing.opportunityWindow}
											</span>
										</span>
									</li>
								),
							)}
						</ul>
					</section>
				</div>
			</div>
		</div>,
		document.body,
	);
}
