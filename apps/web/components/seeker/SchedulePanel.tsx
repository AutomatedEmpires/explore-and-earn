import type { IconKey } from "@explore-and-earn/ui";

import { EmptyState } from "../discovery";
import { CardStatus } from "./CardStatus";
import {
	SCHEDULE_STATUS_LABEL,
	type ScheduleProposal,
	type ScheduleStatus,
} from "./schedule";
import styles from "./SchedulePanel.module.css";

const STATUS_ICON: Record<ScheduleStatus, IconKey> = {
	proposed: "system.info",
	confirmed: "system.success",
	declined: "action.close",
	completed: "status.filled",
};

export interface SchedulePanelProps {
	readonly proposals: readonly ScheduleProposal[];
}

/** Scheduling proposals. Status is label-first via the shared CardStatus pill (never color-only). */
export function SchedulePanel({ proposals }: SchedulePanelProps) {
	if (proposals.length === 0) {
		return (
			<EmptyState
				title="Nothing scheduled"
				message="Interview, call, and trial-day proposals from hosts will appear here."
			/>
		);
	}

	return (
		<ul className={styles.list}>
			{proposals.map((proposal) => (
				<li key={proposal.id} className={styles.item}>
					<div className={styles.head}>
						<div className={styles.text}>
							<span className={styles.kind}>{proposal.kind}</span>
							<span className={styles.meta}>
								{proposal.hostName} · {proposal.listingTitle}
							</span>
						</div>
						<CardStatus
							icon={STATUS_ICON[proposal.status]}
							label={SCHEDULE_STATUS_LABEL[proposal.status]}
						/>
					</div>
					<span className={styles.when}>{proposal.proposedFor}</span>
					{proposal.note ? <p className={styles.note}>{proposal.note}</p> : null}
				</li>
			))}
		</ul>
	);
}
