import { Icon, type IconKey } from "@explore-and-earn/ui";

import { CATEGORY_ICON, EmptyState } from "../discovery";
import { CardStatus } from "./CardStatus";
import { TRAVEL_STATUS_LABEL, type TravelPlan, type TravelStatus } from "./travel";
import styles from "./TravelPanel.module.css";

const STATUS_ICON: Record<TravelStatus, IconKey> = {
	not_started: "system.info",
	shared: "action.share",
	booked: "system.success",
};

export interface TravelPanelProps {
	readonly plans: readonly TravelPlan[];
}

/** Pre-trip planning for accepted roles, including any host-shared travel notes. */
export function TravelPanel({ plans }: TravelPanelProps) {
	if (plans.length === 0) {
		return (
			<EmptyState
				title="No travel plans yet"
				message="Once you accept a role, plan your trip and review host travel notes here."
			/>
		);
	}

	return (
		<ul className={styles.list}>
			{plans.map((plan) => (
				<li key={plan.id} className={styles.item}>
					<div className={styles.head}>
						<span className={styles.icon}>
							<Icon name={CATEGORY_ICON[plan.category]} size={24} aria-hidden />
						</span>
						<div className={styles.text}>
							<span className={styles.title}>{plan.listingTitle}</span>
							<span className={styles.meta}>{plan.hostName}</span>
						</div>
						<CardStatus
							icon={STATUS_ICON[plan.status]}
							label={TRAVEL_STATUS_LABEL[plan.status]}
						/>
					</div>
					<dl className={styles.details}>
						<div className={styles.detail}>
							<dt className={styles.detailLabel}>Destination</dt>
							<dd className={styles.detailValue}>{plan.destination}</dd>
						</div>
						<div className={styles.detail}>
							<dt className={styles.detailLabel}>Starts</dt>
							<dd className={styles.detailValue}>{plan.startDate}</dd>
						</div>
					</dl>
					{plan.hostNote ? (
						<p className={styles.note}>
							<span className={styles.noteIcon}>
								<Icon name="benefit.transport" size={16} aria-hidden />
							</span>
							<span>{plan.hostNote}</span>
						</p>
					) : null}
				</li>
			))}
		</ul>
	);
}
