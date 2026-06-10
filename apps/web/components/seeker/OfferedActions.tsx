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
	invalid_transition: "This offer has already been responded to.",
};

/** Days remaining before the expiry timestamp (null when no expiry set). */
function daysUntilExpiry(expiresAt: string | null): number | null {
	if (!expiresAt) return null;
	const diff = new Date(expiresAt).getTime() - Date.now();
	return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export interface OfferedActionsProps {
	readonly applicationId: string;
	/** ISO timestamp from applications.expires_at — null when not yet set. */
	readonly expiresAt?: string | null;
}

/**
 * Accept / Decline controls for an offered application card.
 *
 * Mirrors InviteActions: useTransition + aria-live status line. Shows an
 * expiry warning when the offer deadline is within 2 days, per the 7-day
 * offer expiry window defined in LIFECYCLE_EXPIRY_DAYS.
 */
export function OfferedActions({ applicationId, expiresAt = null }: OfferedActionsProps) {
	const [isPending, startTransition] = useTransition();
	const [pendingAction, setPendingAction] = useState<
		"accepted" | "not_selected" | null
	>(null);
	const [message, setMessage] = useState<{
		readonly ok: boolean;
		readonly text: string;
	} | null>(null);

	const days = daysUntilExpiry(expiresAt);
	// Offer expiry window is 7 days; warn when ≤ 2 days remain.
	const expiryWarning =
		days !== null && days <= 2
			? days <= 0
				? "Expires today"
				: days === 1
					? "Expires tomorrow"
					: `Expires in ${days} days`
			: null;

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
			{expiryWarning ? (
				<p className={styles.expiry} aria-live="polite">
					{expiryWarning}
				</p>
			) : null}
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
