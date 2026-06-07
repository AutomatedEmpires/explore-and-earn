import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Map loading state. Fills the viewport with a neutral surface plus a centered
 * spinner while the Mapbox canvas and listing pins hydrate.
 */
export default function MapLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.fill}>
				<Skeleton variant="rect" />
			</div>
			<div className={styles.spinner} aria-hidden />
			<span className={styles.srOnly}>Loading map</span>
		</div>
	);
}
