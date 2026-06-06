import { Skeleton } from "@explore-and-earn/ui";

import styles from "./(seeker)/loading.module.css";

/**
 * Root-level loading state. Shown for public routes (/, /listing/[id], /search)
 * while the route segment resolves. Uses the Seek grid skeleton since those
 * routes render listing cards.
 */
export default function RootLoading() {
	const CARD_KEYS = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.header}>
				<div className={styles.headingLine}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.subheadingLine}>
					<Skeleton variant="text" />
				</div>
			</div>
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
						<div className={styles.cardLine}>
							<Skeleton variant="text" />
						</div>
					</div>
				))}
			</div>
			<span className={styles.srOnly}>Loading</span>
		</div>
	);
}
