import { Skeleton } from "@explore-and-earn/ui";

import styles from "./DiscoveryCardSkeleton.module.css";

export function DiscoveryCardSkeleton() {
	return (
		<div className={`ui-card ${styles.card}`} aria-hidden>
			{/* Cover photo */}
			<div className={styles.cover}>
				<Skeleton variant="rect" />
			</div>
			{/* Host identity row */}
			<div className={styles.hostRow}>
				<div className={styles.avatar}>
					<Skeleton variant="circle" />
				</div>
				<div className={styles.hostName}>
					<Skeleton variant="text" />
				</div>
			</div>
			{/* Listing title */}
			<div className={styles.title}>
				<Skeleton variant="text" />
			</div>
			{/* Location + window */}
			<div className={styles.meta}>
				<Skeleton variant="text" />
			</div>
			{/* Benefit triad: Housing / Meals / Pay */}
			<div className={styles.triad}>
				<div className={styles.chip}><Skeleton variant="text" /></div>
				<div className={styles.chip}><Skeleton variant="text" /></div>
				<div className={styles.chip}><Skeleton variant="text" /></div>
			</div>
			{/* CTA button row */}
			<div className={styles.cta}>
				<Skeleton variant="rect" />
			</div>
		</div>
	);
}
