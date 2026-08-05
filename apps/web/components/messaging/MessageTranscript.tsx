"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@explore-and-earn/db/client";

import type { SendMessageActionResult } from "../../app/actions/messages";
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

const DELIVERY_UNCONFIRMED = {
	ok: false,
	error: "delivery_unconfirmed",
	retryable: true,
} as const satisfies SendMessageActionResult;

type DeliveryAttempt = Pick<Message, "senderType" | "body" | "createdAt">;

function matchesDeliveryAttempt(
	message: Message,
	attempt: DeliveryAttempt,
): boolean {
	const messageTs = new Date(message.createdAt).getTime();
	const attemptTs = new Date(attempt.createdAt).getTime();
	return (
		Number.isFinite(messageTs) &&
		Number.isFinite(attemptTs) &&
		message.senderType === attempt.senderType &&
		message.body === attempt.body &&
		Math.abs(messageTs - attemptTs) < 30_000
	);
}

/**
 * Find the row that proves an ambiguous attempt reached the database.
 * `knownMessageIds` is snapshotted before submit, so an older identical message
 * cannot be mistaken for the attempt that just lost its response.
 */
export function findPersistedDelivery(
	serverMessages: readonly Message[],
	attempt: DeliveryAttempt,
	knownMessageIds: ReadonlySet<string>,
): Message | null {
	return (
		serverMessages.find(
			(message) =>
				!knownMessageIds.has(message.id) &&
				!message.id.startsWith(OPTIMISTIC_PREFIX) &&
				matchesDeliveryAttempt(message, attempt),
		) ?? null
	);
}

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
	const optimisticIdx = current.findIndex(
		(m) =>
			m.id.startsWith(OPTIMISTIC_PREFIX) &&
			matchesDeliveryAttempt(incoming, m),
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

export function MessageTranscript(props: MessageTranscriptProps) {
  // A host can switch threads without leaving the workspace. Keying the stateful
  // inner transcript prevents the prior applicant's messages from surviving at
  // the same React position (or flashing while an effect catches up).
  return <ConversationTranscript key={props.conversationId} {...props} />;
}

function ConversationTranscript({
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

	const bottomRef = useRef<HTMLLIElement | null>(null);
	const messagesRef = useRef<readonly MessageView[]>(messages);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

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
		async (body: string): Promise<SendMessageActionResult> => {
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
			const knownBeforeSend = new Set(
				messagesRef.current
					.filter((message) => !message.id.startsWith(OPTIMISTIC_PREFIX))
					.map((message) => message.id),
			);
			setMessages((current) => [...current, optimistic]);

			let actions: typeof import("../../app/actions/messages") | null = null;
			let result: SendMessageActionResult;
			try {
				actions = await import("../../app/actions/messages");
				result = await actions.sendMessageAction(conversationId, body);
			} catch {
				// A rejected action response does not prove the INSERT failed. Treat it
				// as ambiguous and run the same one-time transcript reconciliation as
				// the server's bounded `delivery_unconfirmed` result.
				result = DELIVERY_UNCONFIRMED;
			}

			if (result.ok) {
				// Clear the pending flag. The realtime INSERT reconciles this bubble
				// with the persisted row (matched by the optimistic id prefix); if
				// realtime is unavailable the message still shows as sent.
				setMessages((current) =>
					current.map((m) =>
						m.id === tempId ? { ...m, pending: false } : m,
					),
				);
				try {
					onSent?.();
				} catch {
					// Product analytics is downstream of the durable message and cannot
					// turn a successful send into a duplicate-prone retry.
				}
				return { ok: true };
			}

			if (result.error === "delivery_unconfirmed") {
				try {
					actions ??= await import("../../app/actions/messages");
					const refreshed = await actions.fetchConversationMessagesAction(
						conversationId,
					);
					if (refreshed.ok) {
						const persisted = findPersistedDelivery(
							refreshed.messages,
							optimistic,
							knownBeforeSend,
						);
						if (persisted) {
							setMessages((current) =>
								reconcileServer(current, refreshed.messages),
							);
							try {
								onSent?.();
							} catch {
								// Same post-persist boundary as the direct-success path above.
							}
							return { ok: true };
						}
					}
				} catch {
					// The one verification read is best-effort. The composer will retain
					// the draft and describe the delivery as unconfirmed, never unsent.
				}
			}

			// Remove exactly this attempt. A polling tick may already have replaced
			// it with a persisted row; filtering by the temporary id preserves that
			// row and every other in-flight or received message.
			setMessages((current) => current.filter((m) => m.id !== tempId));
			return result;
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
				<div
					role="log"
					aria-label="Conversation messages"
					aria-live="polite"
					aria-relevant="additions"
				>
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
										{message.pending
											? "Sending…"
											: formatSentAt(message.createdAt)}
									</span>
								</li>
							);
						})}
						<li ref={bottomRef} aria-hidden className={styles.anchor} />
					</ol>
				</div>
			)}
			<ReplyForm
				conversationId={conversationId}
				placeholder={replyPlaceholder}
				onSend={handleSend}
			/>
		</div>
	);
}
