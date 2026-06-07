import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Loading state for the applied list. Mirrors the row layout (thumbnail + two
 * text lines) so the skeleton matches the applications list.
 */
export default function AppliedLoading() {
	const ROW_KEYS = ["row-1", "row-2", "row-3"];
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.list}>
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
			</div>
			<span className={styles.srOnly}>Loading applications</span>
		</div>
	);
}
