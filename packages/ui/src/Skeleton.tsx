import type { CSSProperties } from "react";

/**
 * Skeleton — placeholder loading primitive. Token-driven styling only.
 * Shimmer sweep (Design System V1) is on by default; reduced-motion disables it.
 */
export interface SkeletonProps {
	/** Shape hint -> token-driven classname. */
	readonly variant?: "text" | "rect" | "circle";
	/** Gradient sweep animation. Defaults to true; honors reduced-motion. */
	readonly shimmer?: boolean;
	/** Optional explicit width (CSS length). Overrides the variant default. */
	readonly width?: string;
	/** Optional explicit height (CSS length). Overrides the variant default. */
	readonly height?: string;
	/** Render N identical placeholders (default 1) — handy for row/line groups. */
	readonly count?: number;
}

export function Skeleton({ variant = "rect", shimmer = true, width, height, count = 1 }: SkeletonProps) {
	const cls = `ui-skeleton ui-skeleton--${variant}${shimmer ? " ui-skeleton--shimmer" : ""}`;
	const style: CSSProperties | undefined =
		width !== undefined || height !== undefined ? { width, height } : undefined;
	if (count <= 1) {
		return <span className={cls} style={style} aria-hidden />;
	}
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<span key={index} className={cls} style={style} aria-hidden />
			))}
		</>
	);
}
