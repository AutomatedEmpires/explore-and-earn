import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Swipe deck loading state. Mirrors the stacked-card swipe UI with three
 * layered card skeletons so the transition into the live deck reads as
 * intentional rather than a flash of empty space.
 */
export default function SwipeLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.deck}>
				<div className={`${styles.card} ${styles.card3}`}>
					<Skeleton variant="rect" />
				</div>
				<div className={`${styles.card} ${styles.card2}`}>
					<Skeleton variant="rect" />
				</div>
				<div className={`${styles.card} ${styles.card1}`}>
					<Skeleton variant="rect" />
				</div>
			</div>
			<span className={styles.srOnly}>Loading</span>
		</div>
	);
}
