"use client";

import {
	useId,
	useRef,
	useState,
	useTransition,
	type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import {
	sendMessageAction,
	type SendMessageActionResult,
	type SendMessageFailureCode,
} from "../../app/actions/messages";
import styles from "./ReplyForm.module.css";

type SendFailure = Extract<SendMessageActionResult, { readonly ok: false }>;

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
	readonly onSend?: (body: string) => Promise<SendMessageActionResult>;
}

const MAX_BODY_LENGTH = 4000;

const DELIVERY_UNCONFIRMED: SendFailure = {
	ok: false,
	error: "delivery_unconfirmed",
	retryable: true,
};

const FAILURE_COPY: Record<SendMessageFailureCode, string> = {
	unauthenticated: "Your session expired. Sign in again before sending.",
	rate_limit_exceeded:
		"You're sending messages too quickly. Wait a minute, then try again.",
	conversation_unavailable: "This conversation is no longer available.",
	invalid_message: "Enter a message of up to 4,000 characters.",
	delivery_unconfirmed:
		"Delivery couldn't be confirmed. Check the thread, then try again if the message does not appear.",
};

export function ReplyForm({
	conversationId,
	placeholder = "Write a message…",
	onSend,
}: ReplyFormProps) {
	const [body, setBody] = useState("");
	const [failure, setFailure] = useState<SendFailure | null>(null);
	const [isPending, startTransition] = useTransition();
	const router = useRouter();
	const errorId = useId();
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const submitGuardRef = useRef(false);
	const selectionRef = useRef({ start: 0, end: 0 });

	const trimmed = body.trim();
	const terminalFailure =
		failure != null &&
		!failure.retryable &&
		failure.error !== "invalid_message";
	const disabled =
		isPending ||
		terminalFailure ||
		trimmed.length === 0 ||
		trimmed.length > MAX_BODY_LENGTH;
	const error = failure ? FAILURE_COPY[failure.error] : null;

	function restoreDraftFocus() {
		requestAnimationFrame(() => {
			const input = inputRef.current;
			if (!input) return;
			input.focus({ preventScroll: true });
			const length = input.value.length;
			input.setSelectionRange(
				Math.min(selectionRef.current.start, length),
				Math.min(selectionRef.current.end, length),
			);
		});
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// `isPending` is state and can lag a rapid second tap by one render. The
		// synchronous ref closes that gap without making the textarea lose focus.
		if (disabled || submitGuardRef.current) return;
		submitGuardRef.current = true;
		const input = inputRef.current;
		selectionRef.current = {
			start: input?.selectionStart ?? body.length,
			end: input?.selectionEnd ?? body.length,
		};
		setFailure(null);
		startTransition(async () => {
			try {
				const result = onSend
					? await onSend(trimmed)
					: await sendMessageAction(conversationId, trimmed);
				if (result.ok) {
					setBody("");
					setFailure(null);
					if (!onSend) router.refresh();
					return;
				}
				setFailure(result);
				restoreDraftFocus();
			} catch {
				// The transcript normally converts this into a bounded result after its
				// verification read. Keep the standalone form safe too.
				setFailure(DELIVERY_UNCONFIRMED);
				restoreDraftFocus();
			} finally {
				submitGuardRef.current = false;
			}
		});
	}

	return (
		<form
			className={styles.form}
			onSubmit={handleSubmit}
			aria-label="Reply"
			aria-busy={isPending}
		>
			<textarea
				ref={inputRef}
				className={styles.input}
				rows={3}
				value={body}
				maxLength={MAX_BODY_LENGTH}
				placeholder={placeholder}
				aria-label="Message"
				aria-describedby={error ? errorId : undefined}
				aria-invalid={Boolean(error)}
				aria-readonly={isPending}
				onChange={(event) => {
					setBody(event.target.value);
					setFailure(null);
				}}
				readOnly={isPending}
			/>
			{error ? (
				<p id={errorId} className={styles.error} role="alert">
					{error}
				</p>
			) : null}
			<div className={styles.actions}>
				<button type="submit" className={styles.send} disabled={disabled}>
					{isPending ? "Sending…" : failure?.retryable ? "Try again" : "Send"}
				</button>
			</div>
		</form>
	);
}
