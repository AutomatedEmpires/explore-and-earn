import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Loading state for the map view. A full-height canvas placeholder holds the
 * space while Mapbox and the listing pins resolve.
 */
export default function MapLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.canvas}>
				<Skeleton variant="rect" />
			</div>
			<span className={styles.srOnly}>Loading map</span>
		</div>
	);
}
