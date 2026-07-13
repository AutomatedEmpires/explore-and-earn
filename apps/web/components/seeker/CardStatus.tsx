import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./CardStatus.module.css";

/**
 * Lifecycle tone for the status pill. Drives a warm tinted background + icon
 * colour so the six-state ladder (Saved · Applied · Reviewing · Offered ·
 * Accepted · Not selected) reads by icon AND colour, never colour alone. Warm
 * register only — "muted" is a quiet graphite, never an alarming red.
 */
export type CardStatusTone = "neutral" | "info" | "soon" | "ready" | "muted";

/**
 * Fallback tone inferred from the status icon so every existing CardStatus
 * consumer gains consistent colour without changing its call site. An explicit
 * `tone` prop always wins.
 */
const ICON_TONE: Partial<Record<IconKey, CardStatusTone>> = {
	"system.success": "ready",
	"status.accepted": "ready",
	"status.offered": "soon",
	"status.boosted": "soon",
	"status.begins": "soon",
	"system.info": "info",
	"status.applied": "info",
	"action.close": "muted",
	"status.declined": "muted",
	"status.withdrawn": "muted",
};

const TONE_CLASS: Record<CardStatusTone, string> = {
	neutral: styles.toneNeutral,
	info: styles.toneInfo,
	soon: styles.toneSoon,
	ready: styles.toneReady,
	muted: styles.toneMuted,
};

export interface CardStatusProps {
	readonly icon?: IconKey;
	readonly label: string;
	readonly detail?: string;
	/** Lifecycle colour tone. Defaults to a tone inferred from `icon`. */
	readonly tone?: CardStatusTone;
}

/**
 * Compact lifecycle status pill rendered in a DiscoveryCard's action slot
 * (replaces the default Save/Apply affordances for lifecycle buckets).
 */
export function CardStatus({ icon, label, detail, tone }: CardStatusProps) {
	const effectiveTone: CardStatusTone =
		tone ?? (icon ? ICON_TONE[icon] ?? "neutral" : "neutral");
	return (
		<span className={`${styles.status} ${TONE_CLASS[effectiveTone]}`}>
			{icon ? (
				<Icon name={icon} size={16} className={styles.icon} aria-hidden />
			) : null}
			<span className={styles.label}>{label}</span>
			{detail ? <span className={styles.detail}>{detail}</span> : null}
		</span>
	);
}
