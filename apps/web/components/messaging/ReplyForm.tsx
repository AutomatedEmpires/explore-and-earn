"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { sendMessageAction } from "../../app/actions/messages";
import styles from "./ReplyForm.module.css";

export interface ReplyFormProps {
	readonly conversationId: string;
	readonly placeholder?: string;
	/**
	 * Optional send handler. When provided (e.g. by MessageTranscript for
	 * optimistic + realtime updates), it OWNS sending: this form only collects
	 * the input and delegates, and does NOT call the server action or refresh the
	 * router itself (the parent surfaces send errors). When omitted, the form
	 * falls back to calling sendMessageAction directly and refreshing — the
	 * legacy standalone behavior.
	 */
	readonly onSend?: (body: string) => Promise<{ ok: boolean }>;
}

const MAX_BODY_LENGTH = 4000;

export function ReplyForm({
	conversationId,
	placeholder = "Write a message…",
	onSend,
}: ReplyFormProps) {
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

	const trimmed = body.trim();
	const disabled =
		isPending || trimmed.length === 0 || trimmed.length > MAX_BODY_LENGTH;

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (disabled) return;
		setError(null);
		startTransition(async () => {
			if (onSend) {
				// Parent owns optimistic state + error display; just clear on success.
				const result = await onSend(trimmed);
				if (result.ok) setBody("");
				return;
			}
			const result = await sendMessageAction(conversationId, trimmed);
			if (result.ok) {
				setBody("");
				router.refresh();
			} else {
				setError("Your message couldn't be sent. Please try again.");
			}
		});
	}

	return (
		<form className={styles.form} onSubmit={handleSubmit} aria-label="Reply">
			<textarea
				className={styles.input}
				rows={3}
				value={body}
				maxLength={MAX_BODY_LENGTH}
				placeholder={placeholder}
				aria-label="Message"
				onChange={(event) => setBody(event.target.value)}
				disabled={isPending}
			/>
			{error ? (
				<p className={styles.error} role="alert">
					{error}
				</p>
			) : null}
			<div className={styles.actions}>
				<button type="submit" className={styles.send} disabled={disabled}>
					{isPending ? "Sending…" : "Send"}
				</button>
			</div>
		</form>
	);
}
