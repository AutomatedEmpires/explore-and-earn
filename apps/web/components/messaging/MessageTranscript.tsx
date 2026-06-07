"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, type Message } from "@explore-and-earn/db";

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

/** Map a realtime `messages` row (snake_case) to our camelCase Message shape. */
function rowToMessage(row: Record<string, unknown>): Message {
	return {
		id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
		conversationId:
			typeof row.conversation_id === "string" ? row.conversation_id : "",
		senderType: row.sender_type === "host" ? "host" : "seeker",
		senderProfileId:
			typeof row.sender_profile_id === "string" ? row.sender_profile_id : "",
		body: typeof row.body === "string" ? row.body : "",
		readAt: typeof row.read_at === "string" ? row.read_at : null,
		createdAt:
			typeof row.created_at === "string"
				? row.created_at
				: new Date().toISOString(),
	};
}

/**
 * Fold a realtime INSERT into the local list:
 *  - ignore a row we already have (its real id is present and not optimistic);
 *  - otherwise collapse a matching optimistic bubble (same side + body) into the
 *    persisted row, so the sender's own message is not duplicated;
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
			m.senderType === incoming.senderType &&
			m.body === incoming.body,
	);
	if (optimisticIdx !== -1) {
		const next = current.slice();
		next[optimisticIdx] = incoming;
		return next;
	}
	return [...current, incoming];
}

export function MessageTranscript({
	initialMessages,
	conversationId,
	viewerType,
	counterpartName,
	replyPlaceholder,
}: MessageTranscriptProps) {
	const [messages, setMessages] = useState<readonly MessageView[]>(() => [
		...initialMessages,
	]);
	const [error, setError] = useState<string | null>(null);

	// A single anon-key Supabase client for the lifetime of this component. The
	// messages channel is a public channel (RLS is not yet enabled), so the anon
	// key is the correct credential per the realtime identity rules.
	const [supabase] = useState<SupabaseClient>(
		() => anonClient() as unknown as SupabaseClient,
	);

	const bottomRef = useRef<HTMLLIElement | null>(null);

	// Subscribe to INSERTs on this conversation and append/reconcile them.
	useEffect(() => {
		const channel = supabase
			.channel(`messages:${conversationId}`)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "messages",
					filter: `conversation_id=eq.${conversationId}`,
				},
				(payload: { new: Record<string, unknown> }) => {
					const incoming = rowToMessage(payload.new);
					if (!incoming.id) return;
					setMessages((current) => mergeIncoming(current, incoming));
				},
			)
			.subscribe();

		return () => {
			void supabase.removeChannel(channel);
		};
	}, [supabase, conversationId]);

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
				return { ok: true };
			}
			// Failure: drop the optimistic bubble and surface an inline error.
			setMessages((current) => current.filter((m) => m.id !== tempId));
			setError("Your message couldn't be sent. Please try again.");
			return { ok: false };
		},
		[conversationId, viewerType],
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
