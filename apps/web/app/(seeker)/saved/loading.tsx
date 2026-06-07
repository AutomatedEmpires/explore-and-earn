import { Skeleton } from "@explore-and-earn/ui";

import styles from "../loading.module.css";

/**
 * Saved listings loading state. Reuses the shared seeker grid skeleton module
 * to render four card placeholders matching the saved listings grid.
 */
export default function SavedLoading() {
	const CARD_KEYS = ["saved-1", "saved-2", "saved-3", "saved-4"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.grid}>
				{CARD_KEYS.map((key) => (
					<div key={key} className={styles.card}>
						<div className={styles.cover}>
							<Skeleton variant="rect" />
						</div>
						<div className={styles.cardLineWide}>
							<Skeleton variant="text" />
						</div>
						<div className={styles.cardLine}>
							<Skeleton variant="text" />
						</div>
					</div>
				))}
			</div>
			<span className={styles.srOnly}>Loading saved listings</span>
		</div>
	);
}
