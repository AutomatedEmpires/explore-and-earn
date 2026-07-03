import { Icon } from "@explore-and-earn/ui";
import type { SettingsAssurance } from "./account";
import styles from "./SettingsAssurances.module.css";

export interface SettingsAssurancesProps {
	readonly assurances: readonly SettingsAssurance[];
}

/**
 * "What to expect" trust strip for the seeker settings surface. Editorial copy
 * only — reassurances about cost, privacy, and reporting. No DB-backed claims.
 */
export function SettingsAssurances({ assurances }: SettingsAssurancesProps) {
	return (
		<section className={styles.wrap} aria-label="What to expect">
			<ul className={styles.list}>
				{assurances.map((item) => (
					<li key={item.id} className={styles.item}>
						<span className={styles.icon} aria-hidden>
							<Icon name={item.icon} size={20} aria-hidden />
						</span>
						<span className={styles.body}>
							<span className={styles.title}>{item.title}</span>
							<span className={styles.detail}>{item.detail}</span>
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
