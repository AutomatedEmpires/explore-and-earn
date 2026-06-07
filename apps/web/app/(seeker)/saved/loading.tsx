import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Loading state for the saved listings grid. Mirrors the saved card grid so the
 * skeleton matches where the content lands.
 */
export default function SavedLoading() {
	const CARD_KEYS = ["card-1", "card-2", "card-3", "card-4"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.grid}>
				{CARD_KEYS.map((key) => (
					<div key={key} className={styles.card}>
						<div className={styles.cover}>
							<Skeleton variant="rect" />
						</div>
						<div className={styles.lineWide}>
							<Skeleton variant="text" />
						</div>
						<div className={styles.line}>
							<Skeleton variant="text" />
						</div>
					</div>
				))}
			</div>
			<span className={styles.srOnly}>Loading saved listings</span>
		</div>
	);
}
