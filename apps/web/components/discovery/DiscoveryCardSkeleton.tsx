import { Skeleton } from "@explore-and-earn/ui";

import styles from "./DiscoveryCardSkeleton.module.css";

/**
 * DiscoveryCardSkeleton — loading placeholder mirroring the real
 * DiscoveryCard layout 1:1 (cover aspect, avatar position, meta rows,
 * begins|ends strip, HOUSING/MEALS/PAY triad, CTA) so swapping in the
 * live card causes zero layout shift. Shimmer is a warm paper sweep
 * defined in the module CSS (shimmer={false} opts out of the primitive's
 * default grey sweep).
 */
export function DiscoveryCardSkeleton() {
	return (
		<div className={styles.card} aria-hidden>
			{/* 1. Cover photo (16:10, full-bleed) with overlapping host avatar */}
			<div className={styles.cover}>
				<Skeleton variant="rect" shimmer={false} />
				<div className={styles.avatar}>
					<Skeleton variant="circle" shimmer={false} />
				</div>
			</div>
			<div className={styles.body}>
				{/* 2. Host name — quiet caption line */}
				<div className={styles.hostName}>
					<Skeleton variant="text" shimmer={false} />
				</div>
				{/* 3. Listing title — the dominant line */}
				<div className={styles.title}>
					<Skeleton variant="text" shimmer={false} />
				</div>
				{/* 4. Location */}
				<div className={styles.meta}>
					<Skeleton variant="text" shimmer={false} />
				</div>
				{/* 5. Begins | Ends strip */}
				<div className={styles.dates}>
					<div className={styles.dateCell}><Skeleton variant="text" shimmer={false} /></div>
					<div className={styles.dateCell}><Skeleton variant="text" shimmer={false} /></div>
				</div>
				{/* 6. Benefit triad: Housing / Meals / Pay */}
				<div className={styles.triad}>
					<div className={styles.chip}><Skeleton variant="rect" shimmer={false} /></div>
					<div className={styles.chip}><Skeleton variant="rect" shimmer={false} /></div>
					<div className={styles.chip}><Skeleton variant="rect" shimmer={false} /></div>
				</div>
				{/* 7. CTA button row */}
				<div className={styles.cta}>
					<Skeleton variant="rect" shimmer={false} />
				</div>
			</div>
		</div>
	);
}
