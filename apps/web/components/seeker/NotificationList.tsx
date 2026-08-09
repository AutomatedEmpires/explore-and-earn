import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import { EmptyState } from "../discovery";
import type { NotificationItem } from "./account";
import styles from "./NotificationList.module.css";

export interface NotificationListProps {
	readonly items: readonly NotificationItem[];
	readonly emptyTitle?: string;
	readonly emptyMessage?: string;
}

function NotificationContent({
	item,
	actionable,
}: {
	readonly item: NotificationItem;
	readonly actionable: boolean;
}) {
	return (
		<>
			<span className={styles.icon}>
				<Icon name={item.icon} size={20} aria-hidden />
			</span>
			<span className={styles.body}>
				<span className={styles.title}>
					{item.unread ? <span className={styles.srOnly}>Unread: </span> : null}
					{item.title}
				</span>
				<span className={styles.detail}>{item.detail}</span>
			</span>
			<span className={styles.meta}>
				{item.unread ? <span className={styles.dot} aria-hidden /> : null}
				<span className={styles.time}>{item.timeAgo}</span>
			</span>
			{actionable ? (
				<span className={styles.action} aria-hidden>
					Open
					<Icon name="action.forward" size={16} aria-hidden />
				</span>
			) : null}
		</>
	);
}

export function NotificationList({
	items,
	emptyTitle = "You're all caught up",
	emptyMessage = "New invites, offers, and updates will show up here.",
}: NotificationListProps) {
	if (items.length === 0) {
		return (
			<EmptyState
				illustration="empty.notifications"
				title={emptyTitle}
				message={emptyMessage}
			/>
		);
	}

	return (
		<ul className={styles.list}>
			{items.map((item) => {
				const itemClass = item.unread
					? `${styles.item} ${styles.unread}`
					: styles.item;
				const actionLabel = item.unread
					? `Open unread notification: ${item.title}`
					: `Open notification: ${item.title}`;

				return item.actionHref ? (
					<li key={item.id} className={styles.listItem}>
						<Link
							href={item.actionHref}
							className={`${itemClass} ${styles.actionLink}`}
							aria-label={actionLabel}
						>
							<NotificationContent item={item} actionable />
						</Link>
					</li>
				) : (
					<li key={item.id} className={itemClass}>
						<NotificationContent item={item} actionable={false} />
					</li>
				);
			})}
		</ul>
	);
}
