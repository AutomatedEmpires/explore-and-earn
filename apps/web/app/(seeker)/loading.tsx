import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

const CHIP_KEYS = ["chip-1", "chip-2", "chip-3", "chip-4", "chip-5", "chip-6"];
const CARD_KEYS = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"];

/**
 * Shared seeker route loading state. Streams in inside the seeker layout (the
 * header and bottom nav stay put) while a route segment resolves. Mirrors the
 * Seek card grid so the skeleton matches where most navigations land.
 */
export default function SeekerLoading() {
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

			<div className={styles.chips}>
				{CHIP_KEYS.map((key) => (
					<div key={key} className={styles.chip}>
						<Skeleton variant="rect" />
					</div>
				))}
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

			<span className={styles.srOnly}>Loading opportunities</span>
		</div>
	);
}
