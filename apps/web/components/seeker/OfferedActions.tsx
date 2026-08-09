"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Modal } from "@explore-and-earn/ui";

import {
	acceptOfferAction,
	declineOfferAction,
} from "../../app/actions/seekerApplications";
import { formatDate } from "../../lib/format";
import styles from "./InviteActions.module.css";

const ERROR_TEXT: Record<string, string> = {
	unauthenticated: "Sign in to accept or decline offers.",
	profile_not_found: "Finish setting up your seeker profile first.",
	not_found: "This offer is no longer available.",
	forbidden: "You don't have permission to respond to this offer.",
	invalid_transition: "This offer has already been responded to or has expired.",
	invalid_status: "This offer has already been responded to or has expired.",
	conflict: "This offer changed while you were responding. Refresh and try again.",
	listing_full: "This role just filled, so the offer can no longer be accepted.",
};

type OfferDecision = "accept" | "decline";

export interface OfferedActionsProps {
	readonly applicationId: string;
	/** ISO 8601 timestamp from `applications.expires_at`; null when not yet set. */
	readonly expiresAt?: string | null;
	/** Application-detail destination. Omit when these actions render on that page. */
	readonly detailsHref?: string;
	/** Listing title used to make the confirmation consequence specific. */
	readonly subject?: string;
	/** Known local fixture: preview the decision without calling a server action. */
	readonly isDemoFixture?: boolean;
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

function consequenceCopy(
	action: OfferDecision,
	subject: string | undefined,
	isDemoFixture: boolean,
): string {
	const role = subject ? `the ${subject} offer` : "this offer";
	const consequence =
		action === "accept"
			? `Accepting ${role} confirms that you plan to take the role, moves the application to Accepted, and notifies the host.`
			: `Declining ${role} tells the host you will not take the role and moves the application to Withdrawn. You cannot accept this offer afterward.`;

	return isDemoFixture
		? `${consequence} This is a demo: confirming only previews that result here and will not contact the host or change an application.`
		: consequence;
}

/**
 * Offer decision controls for an application card or detail page.
 *
 * Every decision is confirmation-gated. The shared Modal portals above the
 * fixed seeker dock, traps focus, closes on Escape, and restores focus to the
 * button that opened it. Demo fixtures stop before the server-action boundary.
 */
export function OfferedActions({
	applicationId,
	expiresAt,
	detailsHref,
	subject,
	isDemoFixture = false,
}: OfferedActionsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [confirmation, setConfirmation] = useState<OfferDecision | null>(null);
	const [pendingAction, setPendingAction] = useState<OfferDecision | null>(null);
	const [demoDecision, setDemoDecision] = useState<OfferDecision | null>(null);
	const [message, setMessage] = useState<{
		readonly ok: boolean;
		readonly text: string;
	} | null>(null);

	const expired = expiresAt ? isExpired(expiresAt) : false;
	const expiringSoon = !expired && expiresAt ? isExpiringSoon(expiresAt) : false;
	const decisionLocked = isPending || demoDecision !== null;

	function openConfirmation(action: OfferDecision) {
		setMessage(null);
		setConfirmation(action);
	}

	function closeConfirmation() {
		if (!isPending) setConfirmation(null);
	}

	function confirmDecision() {
		const action = confirmation;
		if (!action || isPending) return;

		if (isDemoFixture) {
			setConfirmation(null);
			setDemoDecision(action);
			setMessage({
				ok: true,
				text:
					action === "accept"
						? "Preview only — this demo offer would now be accepted. No application or host was changed."
						: "Preview only — this demo offer would now be declined. No application or host was changed.",
			});
			return;
		}

		setPendingAction(action);
		startTransition(async () => {
			try {
				const result =
					action === "accept"
						? await acceptOfferAction(applicationId)
						: await declineOfferAction(applicationId);

				if (result.ok) {
					setConfirmation(null);
					setPendingAction(null);
					setMessage({
						ok: true,
						text: action === "accept" ? "Offer accepted." : "Offer declined.",
					});
					router.push(action === "accept" ? "/accepted" : "/withdrawn");
					return;
				}

				setPendingAction(null);
				setConfirmation(null);
				setMessage({
					ok: false,
					text:
						(result.error ? ERROR_TEXT[result.error] : undefined) ??
						"Could not update this offer. Try again.",
				});
			} catch {
				// Server actions report their own diagnostics. Do not echo an unknown
				// thrown value into seeker-facing copy.
				setPendingAction(null);
				setConfirmation(null);
				setMessage({
					ok: false,
					text: "Could not update this offer. Try again.",
				});
			}
		});
	}

	return (
		<div className={styles.actions} aria-busy={isPending}>
			{detailsHref ? (
				<Link className={styles.detailsLink} href={detailsHref}>
					View application
				</Link>
			) : null}

			{expired ? (
				<p className={styles.error} role="status">
					This offer has expired.
				</p>
			) : (
				<>
					{expiringSoon && expiresAt ? (
						<p className={styles.expiry} role="note">
							Offer expires{" "}
							{formatDate(expiresAt, {
								month: "short",
								day: "numeric",
								timeZone: "UTC",
							})}
							. Respond soon.
						</p>
					) : null}

					<div className={styles.buttons}>
						<Button
							variant="primary"
							type="button"
							onClick={() => openConfirmation("accept")}
							disabled={decisionLocked}
						>
							{demoDecision === "accept" ? "Preview accepted" : "Accept"}
						</Button>
						<Button
							variant="ghost"
							type="button"
							onClick={() => openConfirmation("decline")}
							disabled={decisionLocked}
						>
							{demoDecision === "decline" ? "Preview declined" : "Decline"}
						</Button>
					</div>
				</>
			)}

			{message ? (
				<p
					className={message.ok ? styles.success : styles.error}
					role="status"
					aria-live="polite"
				>
					{message.text}
				</p>
			) : null}

			{confirmation ? (
				<Modal
					heading={
						confirmation === "accept"
							? "Accept this offer?"
							: "Decline this offer?"
					}
					onClose={closeConfirmation}
				>
					<p className={styles.modalText}>
						{consequenceCopy(confirmation, subject, isDemoFixture)}
					</p>
					<div className={styles.modalButtons}>
						<Button
							variant={confirmation === "accept" ? "primary" : "secondary"}
							onClick={confirmDecision}
							disabled={isPending}
							aria-busy={isPending}
						>
							{isPending && pendingAction === confirmation
								? "Working…"
								: confirmation === "accept"
									? "Confirm acceptance"
									: "Confirm decline"}
						</Button>
						<Button
							variant="ghost"
							onClick={closeConfirmation}
							disabled={isPending}
						>
							Cancel
						</Button>
					</div>
				</Modal>
			) : null}
		</div>
	);
}
