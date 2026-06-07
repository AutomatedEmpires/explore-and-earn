import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Loading state for the public host profile. Mirrors the profile header
 * (avatar + name) and the listing card grid below it.
 */
export default function HostProfileLoading() {
	const CARD_KEYS = ["card-1", "card-2", "card-3", "card-4"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.header}>
				<div className={styles.avatar}>
					<Skeleton variant="rect" />
				</div>
				<div className={styles.headerText}>
					<div className={styles.headingLine}>
						<Skeleton variant="text" />
					</div>
					<div className={styles.subheadingLine}>
						<Skeleton variant="text" />
					</div>
				</div>
			</div>
			<div className={styles.grid}>
				{CARD_KEYS.map((key) => (
					<div key={key} className={styles.card}>
						<Skeleton variant="rect" />
					</div>
				))}
			</div>
			<span className={styles.srOnly}>Loading host profile</span>
		</div>
	);
}
