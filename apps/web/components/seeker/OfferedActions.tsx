"use client";

import { useState, useTransition } from "react";
import { Button } from "@explore-and-earn/ui";

import {
	acceptOfferAction,
	declineOfferAction,
} from "../../app/actions/seekerApplications";
import styles from "./InviteActions.module.css";

const ERROR_TEXT: Record<string, string> = {
	unauthenticated: "Sign in to accept or decline offers.",
	not_found: "This offer is no longer available.",
	invalid_status: "This offer has already been responded to.",
};

export interface OfferedActionsProps {
	readonly applicationId: string;
}

/**
 * Accept / Decline controls for an offered application card. Same interaction
 * pattern as InviteActions: useTransition + aria-live status line.
 */
export function OfferedActions({ applicationId }: OfferedActionsProps) {
	const [isPending, startTransition] = useTransition();
	const [pendingAction, setPendingAction] = useState<
		"accepted" | "not_selected" | null
	>(null);
	const [message, setMessage] = useState<{
		readonly ok: boolean;
		readonly text: string;
	} | null>(null);

	function handleAction(action: "accepted" | "not_selected") {
		setMessage(null);
		setPendingAction(action);
		startTransition(async () => {
			const result =
				action === "accepted"
					? await acceptOfferAction(applicationId)
					: await declineOfferAction(applicationId);
			setPendingAction(null);
			setMessage(
				result.ok
					? {
						ok: true,
						text:
							action === "accepted"
								? "Offer accepted!"
								: "Offer declined.",
					}
					: {
						ok: false,
						text:
							(result.error ? ERROR_TEXT[result.error] : undefined) ??
							"Could not update this offer.",
					},
			);
		});
	}

	return (
		<div className={styles.actions}>
			<div className={styles.buttons}>
				<Button
					variant="primary"
					type="button"
					onClick={() => handleAction("accepted")}
					disabled={isPending}
				>
					{isPending && pendingAction === "accepted"
						? "Working…"
						: "Accept"}
				</Button>
				<Button
					variant="ghost"
					type="button"
					onClick={() => handleAction("not_selected")}
					disabled={isPending}
				>
					{isPending && pendingAction === "not_selected"
						? "Working…"
						: "Decline"}
				</Button>
			</div>
			{message ? (
				<p
					className={message.ok ? styles.success : styles.error}
					role="status"
					aria-live="polite"
				>
					{message.text}
				</p>
			) : null}
		</div>
	);
}
