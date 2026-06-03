import { Icon } from "@explore-and-earn/ui";
import type { SettingGroup } from "./account";
import styles from "./SettingsPanel.module.css";

export interface SettingsPanelProps {
	readonly groups: readonly SettingGroup[];
}

export function SettingsPanel({ groups }: SettingsPanelProps) {
	return (
		<div className={styles.panel}>
			{groups.map((group) => (
				<section key={group.id} className={styles.group}>
					<h3 className={styles.groupTitle}>{group.title}</h3>
					<ul className={styles.rows}>
						{group.rows.map((row) => (
							<li key={row.id} className={styles.row}>
								<span className={styles.icon}>
									<Icon name={row.icon} size={18} aria-hidden />
								</span>
								<span className={styles.label}>{row.label}</span>
								<span className={styles.value}>{row.value}</span>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
