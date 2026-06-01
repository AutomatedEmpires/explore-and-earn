/**
 * Meter — placeholder primitive for the relevance/match signal. Rendered
 * NEUTRAL (never red/green good-bad coloring); final segmented hand-drawn ring
 * arrives with Design System V1. Token-driven styling only.
 */
export interface MeterProps {
	/** 0..100 relevance/fill value. */
	readonly value: number;
	/** Uppercase label, e.g. "MATCH". */
	readonly label?: string;
	/** Segment count for the eventual ring (default 5 per card spec). */
	readonly segments?: number;
}

export function Meter({ value, label, segments = 5 }: MeterProps) {
	const clamped = Math.max(0, Math.min(100, value));
	return (
		<span
			className="ui-meter"
			role="meter"
			aria-valuenow={clamped}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label={label}
			data-segments={segments}
		>
			{label ? <span className="ui-meter__label">{label}</span> : null}
			<span className="ui-meter__value">{clamped}</span>
		</span>
	);
}
