import { Icon } from "@explore-and-earn/ui";

import { CATEGORY_ICON, EmptyState } from "../discovery";
import type { MessageThread } from "./messaging";
import styles from "./MessageList.module.css";

export interface MessageListProps {
	readonly threads: readonly MessageThread[];
}

/**
 * Scoped conversation list. Unread state is conveyed with an icon dot AND
 * screen-reader text (never color/border alone), per the no-color-only canon.
 */
export function MessageList({ threads }: MessageListProps) {
	if (threads.length === 0) {
		return (
			<EmptyState
				title="No messages yet"
				message="Conversations with hosts appear here once you apply, get invited, or receive an offer."
			/>
		);
	}

	return (
		<ul className={styles.list}>
			{threads.map((thread) => (
				<li
					key={thread.id}
					className={thread.unread ? `${styles.item} ${styles.unread}` : styles.item}
				>
					<span className={styles.icon}>
						<Icon name={CATEGORY_ICON[thread.category]} size={24} aria-hidden />
					</span>
					<span className={styles.body}>
						<span className={styles.titleRow}>
							<span className={styles.host}>
								{thread.unread ? <span className={styles.srOnly}>Unread: </span> : null}
								{thread.hostName}
							</span>
							<span className={styles.time}>{thread.timeAgo}</span>
						</span>
						<span className={styles.context}>{thread.listingTitle}</span>
						<span className={styles.preview}>{thread.preview}</span>
					</span>
					{thread.unread ? <span className={styles.dot} aria-hidden /> : null}
				</li>
			))}
		</ul>
	);
}
