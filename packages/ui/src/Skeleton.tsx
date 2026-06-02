/**
 * Skeleton — placeholder loading primitive. Token-driven styling only; the
 * shimmer/motion tokens land with Design System V1.
 */
export interface SkeletonProps {
	/** Shape hint -> token-driven classname. */
	readonly variant?: "text" | "rect" | "circle";
}

export function Skeleton({ variant = "rect" }: SkeletonProps) {
	return <span className={`ui-skeleton ui-skeleton--${variant}`} aria-hidden />;
}
