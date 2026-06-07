import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Loading state for the swipe deck. Mirrors the stacked-card layout so the
 * transition into the seeker swipe experience feels intentional.
 */
export default function SwipeLoading() {
	const CARD_KEYS = ["card-1", "card-2", "card-3"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			{CARD_KEYS.map((key) => (
				<div key={key} className={styles.card}>
					<Skeleton variant="rect" />
				</div>
			))}
			<span className={styles.srOnly}>Loading opportunities</span>
		</div>
	);
}
