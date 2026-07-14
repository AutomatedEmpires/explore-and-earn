import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Applied listings loading state. Three stacked row skeletons matching the
 * application history list rows.
 */
export default function AppliedLoading() {
	const ROW_KEYS = ["applied-1", "applied-2", "applied-3"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			{ROW_KEYS.map((key) => (
				<div key={key} className={styles.row}>
					<div className={styles.thumb}>
						<Skeleton variant="rect" />
					</div>
					<div className={styles.lines}>
						<div className={styles.lineWide}>
							<Skeleton variant="text" />
						</div>
						<div className={styles.line}>
							<Skeleton variant="text" />
						</div>
					</div>
				</div>
			))}
			<span className={styles.srOnly}>Loading applications</span>
		</div>
	);
}
