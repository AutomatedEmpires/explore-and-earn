import { Skeleton } from "@explore-and-earn/ui";

import { DiscoveryCardSkeleton } from "../components/discovery/DiscoveryCardSkeleton";
import styles from "./(seeker)/loading.module.css";

const CARD_KEYS = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"];

export default function RootLoading() {
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
					<DiscoveryCardSkeleton key={key} />
				))}
			</div>
			<span className={styles.srOnly}>Loading</span>
		</div>
	);
}
