import { Icon } from "@explore-and-earn/ui";
import { EmptyState } from "../discovery";
import type { NotificationItem } from "./account";
import styles from "./NotificationList.module.css";

export interface NotificationListProps {
	readonly items: readonly NotificationItem[];
}

export function NotificationList({ items }: NotificationListProps) {
	if (items.length === 0) {
		return (
			<EmptyState
				title="You're all caught up"
				message="New invites, offers, and updates will show up here."
			/>
		);
	}

	return (
		<ul className={styles.list}>
			{items.map((item) => (
				<li
					key={item.id}
					className={item.unread ? `${styles.item} ${styles.unread}` : styles.item}
				>
					<span className={styles.icon}>
						<Icon name={item.icon} size={20} aria-hidden />
					</span>
					<span className={styles.body}>
						<span className={styles.title}>{item.title}</span>
						<span className={styles.detail}>{item.detail}</span>
					</span>
					<span className={styles.time}>{item.timeAgo}</span>
				</li>
			))}
		</ul>
	);
}
