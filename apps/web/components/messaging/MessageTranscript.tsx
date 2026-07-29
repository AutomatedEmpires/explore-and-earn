"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@explore-and-earn/db/client";

import { EmptyState } from "../discovery";
import { ReplyForm } from "./ReplyForm";
import styles from "./MessageTranscript.module.css";

type ViewerType = "seeker" | "host";

/** A transcript row: either a persisted Message or an in-flight optimistic one. */
type MessageView = Message & { readonly pending?: boolean };

export interface MessageTranscriptProps {
	/** Server-rendered initial transcript (oldest first). */
	readonly initialMessages: readonly Message[];
	/** Conversation id — used for the realtime channel, filter, and sends. */
	readonly conversationId: string;
	/** Which side the signed-in viewer is, so their own messages align right. */
	readonly viewerType: ViewerType;
	/**
	 * Display name for the OTHER participant (the side that is not the viewer).
	 * When provided, it replaces the generic "Host"/"Seeker" label on their
	 * messages. Falls back to the generic role label when omitted or empty.
	 */
	readonly counterpartName?: string | null;
	/** Placeholder for the inline reply box. */
	readonly replyPlaceholder?: string;
	/**
	 * Fired ONLY after the server action reports the message persisted.
	 *
	 * Deliberately post-accept rather than on submit: sends are rate-limited (30
	 * a minute) and can be refused, and a caller that counted attempts would
	 * report a messaging volume the database never saw. The transcript owns the
	 * one place that knows the difference, so it is the one place that can say.
	 */
	readonly onSent?: () => void;
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
	message: MessageView,
	viewerType: ViewerType,
	counterpartName?: string | null,
): string {
	if (message.senderType === viewerType) return "You";
	if (counterpartName && counterpartName.trim().length > 0) {
		return counterpartName;
	}
	return message.senderType === "host" ? "Host" : "Seeker";
}

const OPTIMISTIC_PREFIX = "optimistic-";

/** How often the transcript re-reads the server for new messages. */
const POLL_INTERVAL_MS = 8000;

/**
 * Fold one incoming message into the local list:
 *  - ignore a row we already have (its real id is present and not optimistic);
 *  - otherwise collapse a matching optimistic bubble (same side + body + sent
 *    within 30 s) into the persisted row, so the sender's own message is not
 *    duplicated. The timestamp guard prevents two identical messages sent in
 *    rapid succession from both collapsing into the same optimistic bubble.
 *  - otherwise append it (a message from the other participant).
 */
function mergeIncoming(
	current: readonly MessageView[],
	incoming: Message,
): readonly MessageView[] {
	if (current.some((m) => !m.id.startsWith(OPTIMISTIC_PREFIX) && m.id === incoming.id)) {
		return current;
	}
	const incomingTs = new Date(incoming.createdAt).getTime();
	const optimisticIdx = current.findIndex(
		(m) =>
			m.id.startsWith(OPTIMISTIC_PREFIX) &&
			m.senderType === incoming.senderType &&
			m.body === incoming.body &&
			Math.abs(new Date(m.createdAt).getTime() - incomingTs) < 30_000,
	);
	if (optimisticIdx !== -1) {
		const next = current.slice();
		next[optimisticIdx] = incoming;
		return next;
	}
	return [...current, incoming];
}

/**
 * Fold a freshly-fetched server transcript into the local list by replaying each
 * row through mergeIncoming: rows we already have are ignored, the sender's own
 * optimistic bubbles collapse into their persisted rows, and the counterpart's
 * new replies append in order. Never drops an in-flight optimistic bubble that
 * has not yet been persisted.
 */
function reconcileServer(
	current: readonly MessageView[],
	serverMessages: readonly Message[],
): readonly MessageView[] {
	let next = current;
	for (const message of serverMessages) {
		next = mergeIncoming(next, message);
	}
	return next;
}

export function MessageTranscript({
	initialMessages,
	conversationId,
	viewerType,
	counterpartName,
	replyPlaceholder,
	onSent,
}: MessageTranscriptProps) {
	const [messages, setMessages] = useState<readonly MessageView[]>(() => [
		...initialMessages,
	]);
	const [error, setError] = useState<string | null>(null);

	const bottomRef = useRef<HTMLLIElement | null>(null);

	// Poll the RLS-scoped server action for new messages so the counterpart's
	// replies appear without a manual refresh. (Supabase Realtime for `messages`
	// requires an authenticated socket to satisfy the post-048 RLS SELECT policy;
	// the short-lived Clerk token makes a live client channel impractical, so we
	// poll instead — a clean authenticated-realtime channel can replace this
	// later.) Skips work while the tab is hidden; failures are swallowed so a
	// transient error never disrupts the open thread or the send path.
	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const tick = async () => {
			if (
				typeof document !== "undefined" &&
				document.visibilityState === "hidden"
			) {
				if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
				return;
			}
			try {
				const { fetchConversationMessagesAction } = await import(
					"../../app/actions/messages"
				);
				const result = await fetchConversationMessagesAction(conversationId);
				if (!cancelled && result.ok && result.messages.length > 0) {
					setMessages((current) => reconcileServer(current, result.messages));
				}
			} catch {
				// Ignore — the next tick retries; sending is unaffected.
			}
			if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
		};

		timer = setTimeout(tick, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [conversationId]);

	// Auto-scroll to the newest message whenever the count changes.
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: "end" });
	}, [messages.length]);

	const handleSend = useCallback(
		async (body: string): Promise<{ ok: boolean }> => {
			const tempId = `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random()
				.toString(36)
				.slice(2)}`;
			const optimistic: MessageView = {
				id: tempId,
				conversationId,
				senderType: viewerType,
				senderProfileId: "",
				body,
				readAt: null,
				createdAt: new Date().toISOString(),
				pending: true,
			};
			setError(null);
			setMessages((current) => [...current, optimistic]);

			const { sendMessageAction } = await import("../../app/actions/messages");
			const result = await sendMessageAction(conversationId, body);
			if (result.ok) {
				// Clear the pending flag. The realtime INSERT reconciles this bubble
				// with the persisted row (matched by the optimistic id prefix); if
				// realtime is unavailable the message still shows as sent.
				setMessages((current) =>
					current.map((m) =>
						m.id === tempId ? { ...m, pending: false } : m,
					),
				);
				onSent?.();
				return { ok: true };
			}
			// Failure: drop the optimistic bubble and surface an inline error.
			setMessages((current) => current.filter((m) => m.id !== tempId));
			setError("Your message couldn't be sent. Please try again.");
			return { ok: false };
		},
		[conversationId, viewerType, onSent],
	);

	return (
		<div className={styles.wrap}>
			{messages.length === 0 ? (
				<EmptyState
					title="No messages yet"
					message="Send the first message to start this conversation."
				/>
			) : (
				<ol className={styles.transcript}>
					{messages.map((message) => {
						const mine = message.senderType === viewerType;
						const className = [
							styles.message,
							mine ? styles.mine : "",
							message.pending ? styles.pending : "",
						]
							.filter(Boolean)
							.join(" ");
						return (
							<li key={message.id} className={className}>
								<span className={styles.sender}>
									{senderLabel(message, viewerType, counterpartName)}
								</span>
								<p className={styles.body}>{message.body}</p>
								<span className={styles.time}>
									{message.pending ? "Sending…" : formatSentAt(message.createdAt)}
								</span>
							</li>
						);
					})}
					<li ref={bottomRef} aria-hidden className={styles.anchor} />
				</ol>
			)}
			{error ? (
				<p className={styles.sendError} role="alert">
					{error}
				</p>
			) : null}
			<ReplyForm
				conversationId={conversationId}
				placeholder={replyPlaceholder}
				onSend={handleSend}
			/>
		</div>
	);
}
