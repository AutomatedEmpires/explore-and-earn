import { Icon } from "@explore-and-earn/ui";
import type { HelpItem } from "./account";
import styles from "./HelpPanel.module.css";

export interface HelpPanelProps {
	readonly items: readonly HelpItem[];
}

export function HelpPanel({ items }: HelpPanelProps) {
	return (
		<ul className={styles.list}>
			{items.map((item) => (
				<li key={item.id} className={styles.item}>
					<span className={styles.icon}>
						<Icon name={item.icon} size={18} aria-hidden />
					</span>
					<span className={styles.body}>
						<span className={styles.title}>{item.title}</span>
						<span className={styles.detail}>{item.detail}</span>
					</span>
				</li>
			))}
		</ul>
	);
}
