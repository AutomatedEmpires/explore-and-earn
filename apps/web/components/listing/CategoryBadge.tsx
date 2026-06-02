import type { CSSProperties } from "react"
import { Icon, type IconKey } from "@explore-and-earn/ui"
import type { MarketplaceCategory } from "@explore-and-earn/contracts"

const CATEGORY_ICON: Record<MarketplaceCategory, IconKey> = {
	farm: "category.farm",
	maritime: "category.maritime",
	remote: "category.remote",
	seasonal: "category.seasonal",
	mix: "category.mix",
}

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
}

const CATEGORY_ACCENT: Record<
	MarketplaceCategory,
	{ readonly background: string; readonly color: string }
> = {
	farm: { background: "var(--accent-farm-bg)", color: "var(--accent-farm-fg)" },
	maritime: { background: "var(--accent-maritime-bg)", color: "var(--accent-maritime-fg)" },
	remote: { background: "var(--accent-remote-bg)", color: "var(--accent-remote-fg)" },
	seasonal: { background: "var(--accent-seasonal-bg)", color: "var(--accent-seasonal-fg)" },
	mix: { background: "var(--accent-mix-bg)", color: "var(--accent-mix-fg)" },
}

export function CategoryBadge({ category }: { readonly category: MarketplaceCategory }) {
	const accent = CATEGORY_ACCENT[category]
	const badgeStyle: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: "var(--space-4)",
		padding: "var(--space-4) var(--space-12)",
		borderRadius: "var(--radius-pill)",
		background: accent.background,
		color: accent.color,
		fontFamily: "var(--font-ui)",
		fontSize: "var(--type-label-size)",
		lineHeight: "var(--type-label-lh)",
		letterSpacing: "var(--type-label-tracking)",
		textTransform: "uppercase",
		whiteSpace: "nowrap",
	}
	return (
		<span style={badgeStyle}>
			<Icon aria-hidden name={CATEGORY_ICON[category]} size={16} />
			<span>{CATEGORY_LABEL[category]}</span>
		</span>
	)
}
