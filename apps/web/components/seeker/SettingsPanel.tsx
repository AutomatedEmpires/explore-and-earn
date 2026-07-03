import type { ReactNode } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import type { SettingGroup, SettingRow } from "./account";
import styles from "./SettingsPanel.module.css";

export interface SettingsPanelProps {
	readonly groups: readonly SettingGroup[];
}

function RowInner({ row }: { row: SettingRow }) {
	return (
		<>
			<span className={styles.icon} data-tone={row.tone ?? "default"}>
				<Icon name={row.icon} size={20} aria-hidden />
			</span>
			<span className={styles.label} data-tone={row.tone ?? "default"}>
				{row.label}
			</span>
			<span className={styles.value}>{row.value}</span>
			{row.href ? (
				<span className={styles.chevron} aria-hidden>
					<Icon name="action.forward" size={16} aria-hidden />
				</span>
			) : null}
		</>
	);
}

export function SettingsPanel({ groups }: SettingsPanelProps) {
	return (
		<div className={styles.panel}>
			{groups.map((group) => (
				<section key={group.id} className={styles.group}>
					<div className={styles.groupHead}>
						<h3 className={styles.groupTitle}>{group.title}</h3>
						{group.description ? (
							<p className={styles.groupDescription}>{group.description}</p>
						) : null}
					</div>
					<ul className={styles.rows}>
						{group.rows.map((row) => {
							const inner = <RowInner row={row} />;
							let content: ReactNode;
							if (row.href) {
								content = row.href.startsWith("mailto:") ? (
									<a className={styles.rowLink} href={row.href}>
										{inner}
									</a>
								) : (
									<Link className={styles.rowLink} href={row.href}>
										{inner}
									</Link>
								);
							} else {
								content = <span className={styles.rowStatic}>{inner}</span>;
							}
							return (
								<li key={row.id} className={styles.row}>
									{content}
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
