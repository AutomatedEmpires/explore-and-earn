/**
 * Skeleton — placeholder loading primitive. Token-driven styling only.
 * Shimmer sweep (Design System V1) is on by default; reduced-motion disables it.
 */
export interface SkeletonProps {
	/** Shape hint -> token-driven classname. */
	readonly variant?: "text" | "rect" | "circle";
	/** Gradient sweep animation. Defaults to true; honors reduced-motion. */
	readonly shimmer?: boolean;
}

export function Skeleton({ variant = "rect", shimmer = true }: SkeletonProps) {
	const cls = `ui-skeleton ui-skeleton--${variant}${shimmer ? " ui-skeleton--shimmer" : ""}`;
	return <span className={cls} aria-hidden />;
}
