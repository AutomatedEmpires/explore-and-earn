import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Seeker-onboarding scope loading state.
 *
 * The group had an error boundary but no loading one, so a step transition fell
 * back to the [locale]-level discovery-grid skeleton — a wall of cards in the
 * middle of a form. Wizard-shaped here: a step counter, a question, and the
 * field rows the next step will actually render.
 */
const FIELD_KEYS = ["field-1", "field-2", "field-3"];

export default function SeekerOnboardLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.step}>
				<Skeleton variant="text" />
			</div>
			<div className={styles.question}>
				<Skeleton variant="text" />
			</div>
			<div className={styles.helper}>
				<Skeleton variant="text" />
			</div>

			<div className={styles.fields}>
				{FIELD_KEYS.map((key) => (
					<div key={key} className={styles.field}>
						<Skeleton variant="rect" />
					</div>
				))}
			</div>

			<div className={styles.cta}>
				<Skeleton variant="rect" />
			</div>

			<span className={styles.srOnly}>Loading</span>
		</div>
	);
}
