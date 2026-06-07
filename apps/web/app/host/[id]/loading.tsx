import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Host profile loading state. Mirrors the profile header (avatar + name/meta)
 * and the host's listing card grid so the page settles in place when data
 * arrives.
 */
export default function HostProfileLoading() {
	const CARD_KEYS = ["host-card-1", "host-card-2", "host-card-3"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.header}>
				<div className={styles.avatar}>
					<Skeleton variant="circle" />
				</div>
				<div className={styles.headerText}>
					<div className={styles.nameLine}>
						<Skeleton variant="text" />
					</div>
					<div className={styles.metaLine}>
						<Skeleton variant="text" />
					</div>
				</div>
			</div>
			<div className={styles.grid}>
				{CARD_KEYS.map((key) => (
					<div key={key} className={styles.card}>
						<div className={styles.cover}>
							<Skeleton variant="rect" />
						</div>
						<div className={styles.cardLine}>
							<Skeleton variant="text" />
						</div>
					</div>
				))}
			</div>
			<span className={styles.srOnly}>Loading host profile</span>
		</div>
	);
}
