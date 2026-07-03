import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";
import type { HelpItem } from "./account";
import styles from "./HelpPanel.module.css";

export interface HelpPanelProps {
	readonly items: readonly HelpItem[];
}

/** Each help item is a real, tappable link (internal route or mailto). */
export function HelpPanel({ items }: HelpPanelProps) {
	return (
		<ul className={styles.list}>
			{items.map((item) => {
				const inner = (
					<>
						<span className={styles.icon}>
							<Icon name={item.icon} size={20} aria-hidden />
						</span>
						<span className={styles.body}>
							<span className={styles.title}>{item.title}</span>
							<span className={styles.detail}>{item.detail}</span>
						</span>
						<Icon name="action.forward" size={20} aria-hidden />
					</>
				);
				const isExternal = item.href.startsWith("mailto:");
				return (
					<li key={item.id}>
						{isExternal ? (
							<a className={styles.item} href={item.href}>
								{inner}
							</a>
						) : (
							<Link className={styles.item} href={item.href}>
								{inner}
							</Link>
						)}
					</li>
				);
			})}
		</ul>
	);
}
