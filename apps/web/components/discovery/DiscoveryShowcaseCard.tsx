import Link from "next/link";
import { Badge, Icon } from "@explore-and-earn/ui";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	type DiscoveryListing,
} from "./listing";
import styles from "./DiscoveryShowcaseCard.module.css";

const CONDITIONAL_BADGES = {
	boosted: { label: "Boosted", variant: "boosted", icon: "status.boosted" },
	seasonal: { label: "Seasonal", variant: "seasonal", icon: "category.seasonal" },
} as const;

export interface DiscoveryShowcaseCardProps {
	readonly listing: DiscoveryListing;
}

export function DiscoveryShowcaseCard({ listing }: DiscoveryShowcaseCardProps) {
	const hostHref = listing.host.id ? `/host/${listing.host.id}` : null;

	return (
		<article className={styles.card}>
			<div className={`${styles.hero} ${styles[`hero${listing.category}`]}`}>
				{listing.coverImageUrl ? (
					<img
						className={styles.cover}
						src={listing.coverImageUrl}
						alt=""
						loading="lazy"
					/>
				) : null}
				<div className={styles.overlay} />
				<div className={styles.heroTop}>
					<Badge
						label={CATEGORY_LABEL[listing.category]}
						icon={CATEGORY_ICON[listing.category]}
					/>
					<div className={styles.badgeStack}>
						{listing.conditionalBadges?.map((badge) => {
							const config = CONDITIONAL_BADGES[badge];
							return (
								<Badge
									key={badge}
									label={config.label}
									variant={config.variant}
									icon={config.icon}
								/>
							);
						})}
					</div>
				</div>
				<div className={styles.heroBody}>
					<div className={styles.heroText}>
						<p className={styles.kicker}>
							{listing.host.verified ? "Verified host" : "Host opportunity"}
						</p>
						<h3 className={styles.host}>{listing.host.name}</h3>
						<p className={styles.role}>{listing.title}</p>
					</div>
					<span className={styles.categoryIcon}>
						<Icon name={CATEGORY_ICON[listing.category]} size={24} aria-hidden />
					</span>
				</div>
			</div>

			<div className={styles.body}>
				<div className={styles.infoGrid}>
					<div className={styles.infoBlock}>
						<span className={styles.infoLabel}>Location</span>
						<p className={styles.infoValue}>{listing.location}</p>
					</div>
					<div className={styles.infoBlock}>
						<span className={styles.infoLabel}>Window</span>
						<p className={styles.infoValue}>{listing.opportunityWindow}</p>
					</div>
				</div>

				<dl className={styles.triad}>
					<div className={styles.triadItem}>
						<dt className={styles.triadLabel}>Housing</dt>
						<dd className={styles.triadValue}>{listing.benefits.housing.summary}</dd>
					</div>
					<div className={styles.triadItem}>
						<dt className={styles.triadLabel}>Meals</dt>
						<dd className={styles.triadValue}>{listing.benefits.meals.summary}</dd>
					</div>
					<div className={styles.triadItem}>
						<dt className={styles.triadLabel}>Pay</dt>
						<dd className={styles.triadValue}>{listing.benefits.pay.summary}</dd>
					</div>
				</dl>

				<div className={styles.actions}>
					<Link className={styles.primaryLink} href={`/listing/${listing.id}`}>
						Preview role
						<Icon name="action.forward" size={16} aria-hidden />
					</Link>
					{hostHref ? (
						<Link className={styles.secondaryLink} href={hostHref}>
							View host
						</Link>
					) : null}
				</div>
			</div>
		</article>
	);
}