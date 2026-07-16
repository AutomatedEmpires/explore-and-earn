import type { CSSProperties } from "react";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { CATEGORY_ICON, EmptyState } from "../discovery";
import { CardStatus, type CardStatusTone } from "./CardStatus";
import { JOURNEY_STATUS_LABEL, type JourneyStatus, type JourneyStop } from "./journey";
import styles from "./JourneyTimeline.module.css";

const STATUS_ICON: Record<JourneyStatus, IconKey> = {
	completed: "system.success",
	in_progress: "status.boosted",
	upcoming: "system.info",
};

const STATUS_TONE: Record<JourneyStatus, CardStatusTone> = {
	completed: "ready",
	in_progress: "soon",
	upcoming: "info",
};

const STATUS_CLASS: Record<JourneyStatus, string> = {
	completed: styles.completed,
	in_progress: styles.inProgress,
	upcoming: styles.upcoming,
};

export interface JourneyTimelineProps {
	readonly stops: readonly JourneyStop[];
}

/**
 * Chronological "where I've been / where I'm going" trail — a vertical spine of
 * category-colored nodes. The in-progress stop is the one dominant "you are
 * here" node; completed vs upcoming read by node fill, status icon, and colour
 * (never colour alone). Warm register, borders-first, motion via tokens only.
 */
export function JourneyTimeline({ stops }: JourneyTimelineProps) {
	if (stops.length === 0) {
		return (
			<EmptyState
				title="Your journey starts here"
				message="Completed and upcoming roles will map out your adventure over time."
				actionLabel="Find your first season"
				actionHref="/seek"
			/>
		);
	}

	return (
		<ol className={styles.timeline}>
			{stops.map((stop, index) => (
				<li
					key={stop.id}
					className={`${styles.stop} ${STATUS_CLASS[stop.status]}`}
					data-category={stop.category}
					style={{ "--i": index } as CSSProperties}
					aria-current={stop.status === "in_progress" ? "step" : undefined}
				>
					<div className={styles.rail} aria-hidden>
						<span className={styles.marker}>
							<Icon name={CATEGORY_ICON[stop.category]} size={20} aria-hidden />
							{stop.status === "in_progress" ? (
								<span className={styles.live} />
							) : null}
						</span>
					</div>
					<div className={styles.content}>
						<div className={styles.head}>
							<div className={styles.text}>
								{stop.status === "in_progress" ? (
									<span className={styles.hereTag}>You are here</span>
								) : null}
								<span className={styles.title}>{stop.title}</span>
								<span className={styles.meta}>
									{stop.location} · {stop.dateRange}
								</span>
							</div>
							<CardStatus
								icon={STATUS_ICON[stop.status]}
								label={JOURNEY_STATUS_LABEL[stop.status]}
								tone={STATUS_TONE[stop.status]}
							/>
						</div>
						{stop.summary ? <p className={styles.summary}>{stop.summary}</p> : null}
					</div>
				</li>
			))}
		</ol>
	);
}
