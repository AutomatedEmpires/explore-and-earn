"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";
import { PopupShell } from "../overlay/PopupShell";
import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	type DiscoveryListing,
	type DiscoveryListingHost,
} from "./listing";
import styles from "./HostProfilePopup.module.css";

export interface HostProfilePopupProps {
	readonly host: DiscoveryListingHost | null;
	readonly listings: readonly DiscoveryListing[];
	readonly onClose: () => void;
	readonly onSelectListing?: (id: string) => void;
}

export function HostProfilePopup({ host, listings, onClose, onSelectListing }: HostProfilePopupProps) {
	const router = useRouter();

	const hostListings = useMemo(
		() => host ? listings.filter((l) => l.host.id === host.id) : [],
		[host, listings],
	);

	if (!host) return null;

	const leadListing = hostListings[0] ?? null;
	const roleWord    = hostListings.length === 1 ? "role" : "roles";
	const location    = leadListing?.location ?? null;

	function handleViewProfile() {
		if (!host?.id) return;
		router.push(`/host/${host.id}`);
		onClose();
	}

	return (
		<PopupShell
			open={Boolean(host)}
			onClose={onClose}
			title={host.name}
			size="compact"
			headerIcon={<Icon name="nav.profile" size={20} aria-hidden />}
			headerMeta={
				<div className={styles.headerMeta}>
					{location && (
						<span className={styles.metaPill}>
							<Icon name="nav.map" size={16} aria-hidden />
							{location}
						</span>
					)}
					<span className={styles.metaPill}>
						<Icon name="nav.seek" size={16} aria-hidden />
						{hostListings.length} open {roleWord}
					</span>
				</div>
			}
			hero={
				leadListing?.coverImageUrl ? (
					<div className={styles.hero}>
						<img className={styles.heroImg} src={leadListing.coverImageUrl} alt="" />
						<div className={styles.heroScrim} aria-hidden />
					</div>
				) : undefined
			}
			footer={
				host.id ? (
					<div className={styles.footer}>
						<Button variant="primary" onClick={handleViewProfile}>
							View full profile
						</Button>
					</div>
				) : undefined
			}
			closeLabel="Close host profile"
		>
			{/* Verification + bio */}
			<div className={styles.identity}>
				<div className={host.verified ? styles.trustVerified : styles.trustUnverified}>
					<Icon name={host.verified ? "trust.verified_host" : "nav.profile"} size={16} aria-hidden />
					<span>{host.verified ? "Verified host" : "Not yet verified"}</span>
				</div>
				{host.tagline ? (
					<p className={styles.bio}>{host.tagline}</p>
				) : null}
			</div>

			{/* Roles list */}
			{hostListings.length > 0 ? (
				<ul className={styles.roles} role="list">
					{hostListings.map((listing) => (
						<li key={listing.id}>
							{onSelectListing ? (
								<button
									type="button"
									className={styles.role}
									onClick={() => onSelectListing(listing.id)}
								>
									<span className={styles.roleIcon}>
										<Icon name={CATEGORY_ICON[listing.category]} size={16} aria-hidden />
									</span>
									<span className={styles.roleBody}>
										<span className={styles.roleTitle}>{listing.title}</span>
										<span className={styles.roleMeta}>
											{CATEGORY_LABEL[listing.category]}
											{listing.location ? ` · ${listing.location}` : ""}
											{listing.opportunityWindow ? ` · ${listing.opportunityWindow}` : ""}
										</span>
									</span>
									<span className={styles.roleArrow} aria-hidden>
										<Icon name="action.forward" size={16} aria-hidden />
									</span>
								</button>
							) : (
								<div className={styles.role}>
									<span className={styles.roleIcon}>
										<Icon name={CATEGORY_ICON[listing.category]} size={16} aria-hidden />
									</span>
									<span className={styles.roleBody}>
										<span className={styles.roleTitle}>{listing.title}</span>
										<span className={styles.roleMeta}>
											{CATEGORY_LABEL[listing.category]}
											{listing.location ? ` · ${listing.location}` : ""}
											{listing.opportunityWindow ? ` · ${listing.opportunityWindow}` : ""}
										</span>
									</span>
								</div>
							)}
						</li>
					))}
				</ul>
			) : (
				<p className={styles.empty}>No open roles right now.</p>
			)}
		</PopupShell>
	);
}
