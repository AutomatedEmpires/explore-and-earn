import type { Message } from "@explore-and-earn/db";

import { EmptyState } from "../discovery";
import styles from "./MessageTranscript.module.css";

export interface MessageTranscriptProps {
	readonly messages: readonly Message[];
	/** Which side the signed-in viewer is, so their own messages align right. */
	readonly viewerType: "seeker" | "host";
	/**
	 * Display name for the OTHER participant (the side that is not the viewer).
	 * When provided, it replaces the generic "Host"/"Seeker" label on their
	 * messages. Falls back to the generic role label when omitted or empty.
	 */
	readonly counterpartName?: string | null;
}

function formatSentAt(iso: string): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function senderLabel(
	message: Message,
	viewerType: "seeker" | "host",
	counterpartName?: string | null,
): string {
	if (message.senderType === viewerType) return "You";
	if (counterpartName && counterpartName.trim().length > 0) {
		return counterpartName;
	}
	return message.senderType === "host" ? "Host" : "Seeker";
}

export function MessageTranscript({
	messages,
	viewerType,
	counterpartName,
}: MessageTranscriptProps) {
	if (messages.length === 0) {
		return (
			<EmptyState
				title="No messages yet"
				message="Send the first message to start this conversation."
			/>
		);
	}

	return (
		<ol className={styles.transcript}>
			{messages.map((message) => {
				const mine = message.senderType === viewerType;
				return (
					<li
						key={message.id}
						className={mine ? `${styles.message} ${styles.mine}` : styles.message}
					>
						<span className={styles.sender}>
							{senderLabel(message, viewerType, counterpartName)}
						</span>
						<p className={styles.body}>{message.body}</p>
						<span className={styles.time}>{formatSentAt(message.createdAt)}</span>
					</li>
				);
			})}
		</ol>
	);
}
