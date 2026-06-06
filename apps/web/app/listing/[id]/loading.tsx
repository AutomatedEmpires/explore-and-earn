import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Loading state for the listing detail page. Mirrors the two-column detail
 * layout (hero image + metadata) so the transition feels intentional.
 */
export default function ListingDetailLoading() {
	const TRIAD_KEYS = ["housing", "meals", "pay"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.hero}>
				<Skeleton variant="rect" />
			</div>
			<div className={styles.body}>
				<div className={styles.titleLine}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.subtitleLine}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.triad}>
					{TRIAD_KEYS.map((key) => (
						<div key={key} className={styles.triadCard}>
							<Skeleton variant="rect" />
						</div>
					))}
				</div>
				<div className={styles.bodyLine}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.bodyLine}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.bodyLineShort}>
					<Skeleton variant="text" />
				</div>
			</div>
			<span className={styles.srOnly}>Loading listing</span>
		</div>
	);
}
