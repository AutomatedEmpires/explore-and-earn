import { Skeleton } from "@explore-and-earn/ui";

import styles from "./edit-loading.module.css";

export default function ProfileEditLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.heading}>
				<Skeleton variant="text" />
			</div>
			<div className={styles.subheading}>
				<Skeleton variant="text" />
			</div>
			{["field-1", "field-2", "field-3", "field-4"].map((key) => (
				<div key={key} className={styles.field}>
					<div className={styles.label}>
						<Skeleton variant="text" />
					</div>
					<div className={styles.input}>
						<Skeleton variant="rect" />
					</div>
				</div>
			))}
			<span className={styles.srOnly}>Loading profile editor</span>
		</div>
	);
}
