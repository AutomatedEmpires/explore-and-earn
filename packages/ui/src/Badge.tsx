import { Icon, type IconKey } from "./icons";

/**
 * Badge — placeholder primitive. Badges are NEVER color-only: always pair a
 * label (and optionally an icon) so meaning survives for color-blind users and
 * screen readers. Visual styling is token-driven via classNames only — no
 * hardcoded colors/spacing here (see docs/design/design-system-v1.md).
 */
export interface BadgeProps {
	readonly label: string;
	readonly icon?: IconKey;
	/** Optional qualifier line (e.g. "Self-Declared by Host"). */
	readonly qualifier?: string;
	/** Semantic variant -> token-driven classname. */
	readonly variant?: "neutral" | "featured" | "seasonal" | "boosted" | "verified";
}

export function Badge({ label, icon, qualifier, variant = "neutral" }: BadgeProps) {
	return (
		<span className={`ui-badge ui-badge--${variant}`}>
			{icon ? <Icon aria-hidden name={icon} size={16} /> : null}
			<span className="ui-badge__label">{label}</span>
			{qualifier ? <span className="ui-badge__qualifier">{qualifier}</span> : null}
		</span>
	);
}
