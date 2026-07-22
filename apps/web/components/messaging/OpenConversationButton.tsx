"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@explore-and-earn/ui";

import {
	openHostApplicationConversationAction,
	openSeekerApplicationConversationAction,
} from "../../app/actions/messages";
import styles from "./OpenConversationButton.module.css";

type OpenConversationButtonProps = {
	readonly applicationId: string;
	readonly label: string;
	readonly variant?: "link" | "primary";
} & (
	| {
			readonly role: "seeker";
			readonly seekerProfileId?: never;
	  }
	| {
			readonly role: "host";
			readonly seekerProfileId: string;
	  }
);

const ERROR_TEXT = {
	unauthenticated: "Sign in again to open this conversation.",
	rate_limit_exceeded: "Too many attempts. Wait a moment and try again.",
	unavailable: "This application cannot start a conversation.",
} as const;

export function OpenConversationButton({
	applicationId,
	label,
	variant = "link",
	role,
	seekerProfileId,
}: OpenConversationButtonProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function openConversation() {
		setError(null);
		startTransition(async () => {
			try {
				const result =
					role === "seeker"
						? await openSeekerApplicationConversationAction(applicationId)
						: await openHostApplicationConversationAction(
								seekerProfileId,
								applicationId,
							);
				if (result.ok && result.conversationId) {
					const prefix = role === "host" ? "/host" : "";
					router.push(`${prefix}/messages/${result.conversationId}`);
					return;
				}
				setError(
					result.error ? ERROR_TEXT[result.error] : ERROR_TEXT.unavailable,
				);
			} catch {
				setError("The conversation could not be opened. Try again.");
			}
		});
	}

	return (
		<div
			className={`${styles.root} ${
				variant === "primary" ? styles.primaryRoot : styles.linkRoot
			}`}
		>
			<button
				type="button"
				className={`${styles.button} ${styles[variant]}`}
				onClick={openConversation}
				disabled={isPending}
				aria-busy={isPending}
			>
				<Icon name="action.message" size={variant === "primary" ? 20 : 16} aria-hidden />
				{isPending ? "Opening…" : label}
			</button>
			{error ? (
				<p className={styles.error} role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
