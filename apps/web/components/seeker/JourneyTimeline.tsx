import { Icon, type IconKey } from "@explore-and-earn/ui";

import { EmptyState } from "../discovery";
import { CardStatus } from "./CardStatus";
import { JOURNEY_STATUS_LABEL, type JourneyStatus, type JourneyStop } from "./journey";
import { MAPPIN_ICON } from "./mappin";
import styles from "./JourneyTimeline.module.css";

const STATUS_ICON: Record<JourneyStatus, IconKey> = {
	completed: "system.success",
	in_progress: "status.boosted",
	upcoming: "system.info",
};

export interface JourneyTimelineProps {
	readonly stops: readonly JourneyStop[];
}

/** Chronological "where I've been / where I'm going" timeline. */
export function JourneyTimeline({ stops }: JourneyTimelineProps) {
	if (stops.length === 0) {
		return (
			<EmptyState
				title="Your journey starts here"
				message="Completed and upcoming roles will map out your adventure over time."
			/>
		);
	}

	return (
		<ol className={styles.timeline}>
			{stops.map((stop) => (
				<li key={stop.id} className={styles.stop}>
					<span className={styles.marker} aria-hidden>
						<Icon name={MAPPIN_ICON[stop.category]} size={20} aria-hidden />
					</span>
					<div className={styles.content}>
						<div className={styles.head}>
							<div className={styles.text}>
								<span className={styles.title}>{stop.title}</span>
								<span className={styles.meta}>
									{stop.location} · {stop.dateRange}
								</span>
							</div>
							<CardStatus
								icon={STATUS_ICON[stop.status]}
								label={JOURNEY_STATUS_LABEL[stop.status]}
							/>
						</div>
						{stop.summary ? <p className={styles.summary}>{stop.summary}</p> : null}
					</div>
				</li>
			))}
		</ol>
	);
}
