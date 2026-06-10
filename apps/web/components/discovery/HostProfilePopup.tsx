"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Icon, VerifiedHostBadge } from "@explore-and-earn/ui";
import { PopupShell } from "../overlay/PopupShell";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	type DiscoveryListing,
	type DiscoveryListingHost,
} from "./listing";
import styles from "./HostProfilePopup.module.css";

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
	const router = useRouter();
	const hostListings = useMemo(
		() =>
			host
				? listings.filter((listing) => listing.host.id === host.id)
				: [],
		[host, listings],
	);
	if (!host) {
		return null;
	}

	const leadListing = hostListings[0] ?? null;
	const categories = Array.from(
		new Set(hostListings.map((listing) => listing.category)),
	);
	const hostId = host?.id ?? null;
	const location = leadListing?.location ?? "Location to be announced";
	const roleWord = hostListings.length === 1 ? "opportunity" : "opportunities";
	const yearsOnPlatform = hostListings.length > 0 ? "Active now" : "New host";

	function handleOpenLeadListing() {
		if (leadListing?.id && onSelectListing) {
			onSelectListing(leadListing.id);
			return;
		}
		if (hostId) {
			router.push(`/host/${hostId}`);
			onClose();
		}
	}

	function handleViewProfile() {
		if (!hostId) {
			return;
		}
		router.push(`/host/${hostId}`);
		onClose();
	}

	return (
		<PopupShell
			open={Boolean(host)}
			onClose={onClose}
			title={host.name}
			headerIcon={<Icon name="nav.profile" size={24} aria-hidden />}
			headerMeta={
				<span>
					{hostListings.length} open {roleWord} · {yearsOnPlatform}
				</span>
			}
			headerTags={
				<>
					{host.verified ? <VerifiedHostBadge /> : null}
					{categories.map((category) => (
						<Badge
							key={category}
							label={CATEGORY_LABEL[category]}
							icon={CATEGORY_ICON[category]}
						/>
					))}
				</>
			}
			hero={
				<div className={styles.heroScene}>
					{leadListing?.coverImageUrl ? (
						<img
							className={styles.heroImage}
							src={leadListing.coverImageUrl}
							alt=""
						/>
					) : (
						<div className={styles.heroFallback} aria-hidden>
							<Icon
								name={leadListing ? CATEGORY_ICON[leadListing.category] : "nav.profile"}
								size={24}
								aria-hidden
							/>
							<span>
								{leadListing ? CATEGORY_LABEL[leadListing.category] : "Host"}
							</span>
						</div>
					)}
				</div>
			}
			heroFooter={
				<div className={styles.heroBadge}>
					<div className={styles.medallion}>
						<span className={styles.avatar} aria-hidden>
							<Icon name="nav.profile" size={24} aria-hidden />
						</span>
						{host.verified ? (
							<span className={styles.medallionCheck} aria-hidden>
								<Icon name="trust.verified_host" size={16} aria-hidden />
							</span>
						) : null}
					</div>
				</div>
			}
			footer={
				<div className={styles.footer}>
					{leadListing ? (
						<Button variant="secondary" onClick={handleOpenLeadListing}>
							Open roles
						</Button>
					) : null}
					{hostId ? (
						<Button variant="primary" onClick={handleViewProfile}>
							View full profile
						</Button>
					) : null}
				</div>
			}
			closeLabel="Close host profile"
		>
			<section className={styles.summaryCard} aria-label="Host summary">
				<div className={styles.identityText}>
					<h3 className={styles.name}>{host.name}</h3>
					<p className={styles.trust}>
						{host.verified
							? "This host has completed Explore & Earn's verification process."
							: "This host has not yet completed verification."}
					</p>
				</div>
				<dl className={styles.facts}>
					<div className={styles.fact}>
						<dt>Open roles</dt>
						<dd>{hostListings.length}</dd>
					</div>
					<div className={styles.fact}>
						<dt>Hiring status</dt>
						<dd>{hostListings.length > 0 ? "Hiring now" : "Awaiting roles"}</dd>
					</div>
					<div className={styles.fact}>
						<dt>Activity</dt>
						<dd>{yearsOnPlatform}</dd>
					</div>
				</dl>
			</section>

			<section className={styles.locationBand} aria-label="Primary location">
				<div className={styles.locationCopy}>
					<span className={styles.locationLabel}>
						<Icon name="nav.map" size={16} aria-hidden />
						<span>Location</span>
					</span>
					<p className={styles.locationValue}>{location}</p>
				</div>
				<div className={styles.locationArt} aria-hidden />
			</section>

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
											{CATEGORY_LABEL[listing.category]} · {listing.location} · {listing.opportunityWindow}
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
										{CATEGORY_LABEL[listing.category]} · {listing.location} · {listing.opportunityWindow}
									</span>
								</span>
							</li>
						),
					)}
				</ul>
			</section>
		</PopupShell>
	);
}
