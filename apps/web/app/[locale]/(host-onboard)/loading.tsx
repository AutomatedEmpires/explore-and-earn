import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Host-onboarding scope loading state (plans, activation, checkout, the
 * onboarding wizard).
 *
 * The group already had an error boundary but no loading one, so every
 * transition inside the paid funnel fell through to the [locale]-level
 * discovery-grid skeleton — the wrong shape on the one flow where a host is
 * deciding whether to pay. Shaped to the plans page instead: header, then a
 * three-up card row, which is also close enough to the wizard's step panel that
 * neither reveal jumps.
 */
const CARD_KEYS = ["plan-1", "plan-2", "plan-3"];
const FEATURE_KEYS = ["f-1", "f-2", "f-3", "f-4"];

export default function HostOnboardLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.header}>
				<div className={styles.title}>
					<Skeleton variant="text" />
				</div>
				<div className={styles.subtitle}>
					<Skeleton variant="text" />
				</div>
			</div>

			<div className={styles.grid}>
				{CARD_KEYS.map((key) => (
					<div key={key} className={styles.card}>
						<div className={styles.cardName}>
							<Skeleton variant="text" />
						</div>
						<div className={styles.cardPrice}>
							<Skeleton variant="text" />
						</div>
						<ul className={styles.features}>
							{FEATURE_KEYS.map((feature) => (
								<li key={feature} className={styles.feature}>
									<Skeleton variant="text" />
								</li>
							))}
						</ul>
						<div className={styles.cardCta}>
							<Skeleton variant="rect" />
						</div>
					</div>
				))}
			</div>

			<span className={styles.srOnly}>Loading host setup</span>
		</div>
	);
}
