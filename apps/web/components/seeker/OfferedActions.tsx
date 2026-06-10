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
	profile_not_found: "Finish setting up your seeker profile first.",
	not_found: "This offer is no longer available.",
	forbidden: "You don't have permission to respond to this offer.",
	invalid_transition: "This offer has already been responded to or has expired.",
	invalid_status: "This offer has already been responded to or has expired.",
};

export interface OfferedActionsProps {
	readonly applicationId: string;
	/** ISO 8601 timestamp from `applications.expires_at`; null when not yet set. */
	readonly expiresAt?: string | null;
}

/** Warn when fewer than this many milliseconds remain on the expiry window. */
const EXPIRY_WARNING_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** Returns true if the supplied ISO timestamp is in the past. */
function isExpired(expiresAt: string): boolean {
	return new Date(expiresAt) < new Date();
}

/** Returns true if the offer expires within the next 48 hours. */
function isExpiringSoon(expiresAt: string): boolean {
	const now = Date.now();
	const ms = new Date(expiresAt).getTime() - now;
	return ms > 0 && ms < EXPIRY_WARNING_THRESHOLD_MS;
}

/**
 * Accept / Decline controls for an offered application card. Same interaction
 * pattern as InviteActions: useTransition + aria-live status line.
 *
 * When `expiresAt` is provided and the offer is past its expiry window, the
 * action buttons are replaced with a status message so the seeker is never
 * left clicking a button that will always fail.
 */
export function OfferedActions({ applicationId, expiresAt }: OfferedActionsProps) {
	const [isPending, startTransition] = useTransition();
	const [pendingAction, setPendingAction] = useState<
		"accepted" | "not_selected" | null
	>(null);
	const [message, setMessage] = useState<{
		readonly ok: boolean;
		readonly text: string;
	} | null>(null);

	const expired = expiresAt ? isExpired(expiresAt) : false;
	const expiringSoon = !expired && expiresAt ? isExpiringSoon(expiresAt) : false;

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

	if (expired) {
		return (
			<div className={styles.actions}>
				<p className={styles.error} role="status">
					This offer has expired.
				</p>
			</div>
		);
	}

	return (
		<div className={styles.actions}>
			{expiringSoon && expiresAt ? (
				<p className={styles.expiry} role="note">
					Offer expires{" "}
					{new Date(expiresAt).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
					})}
					. Respond soon.
				</p>
			) : null}
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
