import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Admin catch-all loading state. Shown for any (admin) route segment that does
 * not have its own loading.tsx — the marketplace-health dashboard plus the
 * listings / hosts / applications moderation tables (all service-role queries).
 * The admin header + sidebar stay rendered during the transition.
 */
const STAT_KEYS = ["stat-1", "stat-2", "stat-3", "stat-4"];
const ROW_KEYS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];

export default function AdminLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.header}>
				<div className={styles.titleLine}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.subLine}>
					<Skeleton variant="text" />
				</div>
			</div>

			<div className={styles.statGrid}>
				{STAT_KEYS.map((key) => (
					<div key={key} className={styles.statCard}>
						<span className={styles.label}>
							<Skeleton variant="text" />
						</span>
						<span className={styles.value}>
							<Skeleton variant="text" />
						</span>
					</div>
				))}
			</div>

			<div className={styles.tableCard}>
				{ROW_KEYS.map((key) => (
					<span key={key} className={styles.row}>
						<Skeleton variant="rect" />
					</span>
				))}
			</div>

			<span className={styles.srOnly}>Loading admin data</span>
		</div>
	);
}
