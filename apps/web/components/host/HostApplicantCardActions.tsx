"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@explore-and-earn/ui";

import { updateApplicationStatusAction } from "../../app/actions/applicationStatus";
import { legalCardActions, type ApplicantCardAction, type ApplicantStage } from "./models";
import styles from "./HostApplicantCard.module.css";

export interface HostApplicantCardActionsProps {
	readonly applicantId: string;
	readonly initialStage: ApplicantStage;
	/** RAW applications.status — action legality is computed from this. */
	readonly status: string;
}

/** Friendly copy for the action's error codes (server messages stay raw). */
const ERROR_TEXT: Record<string, string> = {
	invalid_transition: "This application moved on — refresh to see its current state.",
	conflict: "This application changed while you were acting. Refresh and try again.",
	listing_full: "This listing has no remaining spots — free one up before accepting.",
	forbidden: "You don't have permission to update this application.",
	not_found: "This application is no longer available.",
};

export function HostApplicantCardActions({
	applicantId,
	initialStage,
	status,
}: HostApplicantCardActionsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [optimisticStage, setOptimisticStage] = useState<ApplicantStage | null>(null);

	// Only edges that are legal from the CURRENT status render at all —
	// APPLICATION_TRANSITIONS is the single truth (an accepted or closed
	// application shows no buttons instead of four that would all bounce).
	const actions = legalCardActions(status);
	if (actions.length === 0) return null;

	function handleAction(action: ApplicantCardAction) {
		setError(null);
		setOptimisticStage(action.targetStage);
		startTransition(async () => {
			const result = await updateApplicationStatusAction(applicantId, action.status);
			if (result.ok) {
				router.refresh();
				return;
			}
			setOptimisticStage(null);
			setError(
				(result.error ? ERROR_TEXT[result.error] : undefined) ??
					result.error ??
					"Could not update this application.",
			);
		});
	}

	const shownStage = optimisticStage ?? initialStage;

	return (
		<div className={styles.actionRow} aria-busy={isPending}>
			{actions.map((action) => {
				const active = shownStage === action.targetStage;
				return (
					<Button
						key={action.label}
						variant={action.variant}
						onClick={() => handleAction(action)}
						disabled={isPending || active}
					>
						{active ? action.doneLabel : action.label}
					</Button>
				);
			})}
			{error ? (
				<p className={styles.actionError} role="status" aria-live="polite">
					{error}
				</p>
			) : null}
		</div>
	);
}
