import { Skeleton } from "@explore-and-earn/ui";

import { BucketPage } from "../../../../components/seeker";
import styles from "./loading.module.css";

/**
 * Loading placeholder for the seeker messages list. Shown during async
 * navigation so the transition never flashes a blank screen.
 */
export default function Loading() {
	return (
		<BucketPage title="Messages">
			<ul className={styles.list} role="status" aria-label="Loading messages">
				{/* Stable keys: static, fixed-count skeleton — array index is safe. */}
				{Array.from({ length: 4 }, (_, i) => (
				<li key={`skeleton-${i}`} className={styles.item}>
						<span className={styles.icon}>
							<Skeleton variant="rect" />
						</span>
						<span className={styles.body}>
							<Skeleton variant="text" />
							<span className={styles.short}>
								<Skeleton variant="text" />
							</span>
						</span>
					</li>
				))}
			</ul>
		</BucketPage>
	);
}
