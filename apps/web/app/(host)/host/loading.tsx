import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

const KPI_KEYS = ["kpi-1", "kpi-2", "kpi-3", "kpi-4"];

/**
 * Host dashboard loading state. Content-shaped: the skeleton MIRRORS the real
 * dashboard layout (host-page rhythm) so load → loaded never jumps — a hero
 * band, then the four-tile KPI grid, then two raised panel blocks. Composes the
 * shared Skeleton primitive (shimmer, reduced-motion-safe); all spans are
 * aria-hidden and the region announces a single "Loading" label.
 *
 * The host header and bottom nav stay rendered around this during the
 * transition (they live in the (host) layout, outside the streaming boundary).
 */
export default function HostLoading() {
	return (
		<div className={`host-page ${styles.page}`} role="status" aria-label="Loading dashboard">
			{/* Hero band — matches .host-hero's height/radius so it doesn't reflow. */}
			<div className={styles.hero}>
				<Skeleton variant="rect" />
			</div>

			{/* KPI row — same four-up grid the real dashboard uses. */}
			<div className="host-kpiGrid">
				{KPI_KEYS.map((key) => (
					<div key={key} className={styles.kpi}>
						<Skeleton variant="rect" />
					</div>
				))}
			</div>

			{/* Two panel blocks — the attention + pipeline/radar stack. */}
			<div className={styles.panel}>
				<Skeleton variant="rect" />
			</div>
			<div className={styles.panel}>
				<Skeleton variant="rect" />
			</div>

			<span className={styles.srOnly}>Loading your dashboard</span>
		</div>
	);
}
