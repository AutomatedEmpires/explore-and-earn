"use client";

import { useOptimistic, useTransition } from "react";
import { Button } from "@explore-and-earn/ui";

import { updateApplicationStatusAction } from "../../app/actions/applicationStatus";
import type { ApplicantStage } from "./models";
import styles from "./HostApplicantCard.module.css";

export interface HostApplicantCardActionsProps {
	readonly applicantId: string;
	readonly initialStage: ApplicantStage;
}

type CardAction = {
	readonly label: string;
	readonly variant: "secondary" | "ghost";
	readonly targetStage: ApplicantStage;
	readonly status: Parameters<typeof updateApplicationStatusAction>[1];
};

const CARD_ACTIONS: readonly CardAction[] = [
	{
		label: "Skip",
		variant: "ghost",
		targetStage: "declined",
		status: "not_selected",
	},
	{
		label: "Save",
		variant: "secondary",
		targetStage: "saved_by_host",
		status: "saved_by_host",
	},
	{
		label: "Offer",
		variant: "secondary",
		targetStage: "offered",
		status: "offered",
	},
];

export function HostApplicantCardActions({
	applicantId,
	initialStage,
}: HostApplicantCardActionsProps) {
	const [isPending, startTransition] = useTransition();
	const [optimisticStage, setOptimisticStage] = useOptimistic(initialStage);

	function handleAction(action: CardAction) {
		startTransition(async () => {
			setOptimisticStage(action.targetStage);
			await updateApplicationStatusAction(applicantId, action.status);
		});
	}

	return (
		<div className={styles.actionRow} aria-busy={isPending}>
			{CARD_ACTIONS.map((action) => {
				const active = optimisticStage === action.targetStage;
				return (
					<Button
						key={action.label}
						variant={action.variant}
						onClick={() => handleAction(action)}
						disabled={isPending || active}
					>
						{active ? `${action.label}d` : action.label}
					</Button>
				);
			})}
		</div>
	);
}