import type { CSSProperties, ReactNode } from "react";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Meter } from "./Meter";
import { VerifiedHostBadge } from "./VerifiedHostBadge";
import { Icon, type IconKey } from "./icons";
import type {
	DiscoveryCardConditionalBadge,
	DiscoveryCardSurface,
	MarketplaceCategory,
	OpportunityTriad,
} from "@explore-and-earn/contracts";

/**
 * DiscoveryCard — the SINGLE listing card shared by every seeker surface.
 *
 * Canon: docs/product/discovery-card-v1.md + packages/contracts/src/card.ts.
 * One component, many surfaces (product-principles #2/#6): behavior varies by
 * `surface` + props, never by forking. Composed only from design-system
 * primitives + the canonical icon registry; styled with semantic tokens.
 *
 * Rules honored:
 * - Benefit triad is always Housing / Meals / Pay (never "Perks").
 * - The Verified-Host badge always carries "Self-Declared by Host" (G22) via
 *   the VerifiedHostBadge primitive.
 * - Relevance/match is shown ONLY on the "matched" surface, through the NEUTRAL
 *   Meter primitive (never red/green good-bad coloring).
 * - Every badge carries a text label (never color-only).
 */

const CATEGORY_ICON = {
	farm: "category.farm",
	maritime: "category.maritime",
	remote: "category.remote",
	seasonal: "category.seasonal",
	mix: "category.mix",
} satisfies Record<MarketplaceCategory, IconKey>;

const CATEGORY_LABEL = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
} satisfies Record<MarketplaceCategory, string>;

const TRIAD_ORDER: readonly (keyof OpportunityTriad)[] = ["housing", "meals", "pay"];

const TRIAD_META = {
	housing: { icon: "benefit.housing", label: "Housing" },
	meals: { icon: "benefit.meals", label: "Meals" },
	pay: { icon: "benefit.pay", label: "Pay" },
} satisfies Record<keyof OpportunityTriad, { icon: IconKey; label: string }>;

const CONDITIONAL_BADGE = {
	seasonal: { label: "Seasonal", variant: "seasonal", icon: "category.seasonal" },
	featured: { label: "Featured", variant: "featured", icon: "trust.featured_employer" },
	boosted: { label: "Boosted", variant: "boosted", icon: "status.boosted" },
} satisfies Record<
	DiscoveryCardConditionalBadge,
	{ label: string; variant: "seasonal" | "featured" | "boosted"; icon: IconKey }
>;

const cardStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	background: "var(--color-surface-raised)",
	border: "1px solid var(--border-soft)",
	borderRadius: "var(--radius-card)",
	color: "var(--text-primary)",
};

const mediaStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	minHeight: "var(--space-48)",
	padding: "var(--space-24)",
	background: "var(--color-surface)",
	borderBottom: "1px solid var(--border-soft)",
	color: "var(--text-secondary)",
};

const bodyStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-12)",
	padding: "var(--space-card)",
};

const badgeRowStyle: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "var(--space-8)",
};

const headerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-4)",
};

const titleButtonStyle: CSSProperties = {
	margin: 0,
	padding: 0,
	border: "none",
	background: "none",
	textAlign: "left",
	cursor: "pointer",
	color: "inherit",
};

const titleStyle: CSSProperties = {
	fontFamily: "var(--font-display)",
	fontSize: "var(--type-card-size)",
	lineHeight: "var(--type-card-lh)",
	color: "var(--text-primary)",
};

const metaStyle: CSSProperties = {
	margin: 0,
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-meta-size)",
	lineHeight: "var(--type-meta-lh)",
	color: "var(--text-secondary)",
};

const triadStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "1fr 1fr 1fr",
	gap: "var(--space-8)",
	margin: 0,
};

const triadItemStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-4)",
	padding: "var(--space-8)",
	background: "var(--color-surface)",
	border: "1px solid var(--border-soft)",
	borderRadius: "var(--radius-cell)",
};

const triadLabelStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "var(--space-4)",
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-label-size)",
	lineHeight: "var(--type-label-lh)",
	fontWeight: "var(--font-weight-semibold)",
	letterSpacing: "var(--type-label-tracking)",
	textTransform: "uppercase",
	color: "var(--text-secondary)",
};

const triadValueStyle: CSSProperties = {
	margin: 0,
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-meta-size)",
	lineHeight: "var(--type-meta-lh)",
	color: "var(--text-primary)",
};

const footerStyle: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "var(--space-8)",
};

export interface DiscoveryCardData {
	readonly id: string;
	readonly title: string;
	readonly hostName: string;
	readonly category: MarketplaceCategory;
	readonly location: string;
	readonly opportunityWindow: string;
	readonly triad: OpportunityTriad;
	readonly verifiedHost?: boolean;
	readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[];
<<<<<<< HEAD
	/** 0-100 relevance. Rendered (neutral Meter) only on the "matched" surface. */
=======
	/** 0\u2013100 relevance. Rendered (neutral Meter) only on the "matched" surface. */
>>>>>>> d1a7a58 (foundation: enable seeker lane (web→ui/contracts deps + refs, DiscoveryCard primitive))
	readonly matchScore?: number;
}

export interface DiscoveryCardProps {
	readonly data: DiscoveryCardData;
	readonly surface: DiscoveryCardSurface;
	readonly onOpen?: (id: string) => void;
	readonly onSave?: (id: string) => void;
	readonly onApply?: (id: string) => void;
	/** Optional surface-specific action slot; replaces the default Save/Apply row. */
	readonly actions?: ReactNode;
}

export function DiscoveryCard({
	data,
	surface,
	onOpen,
	onSave,
	onApply,
	actions,
}: DiscoveryCardProps) {
	return (
		<article style={cardStyle} data-category={data.category} data-surface={surface}>
			<div style={mediaStyle} aria-hidden={true}>
				<Icon name={CATEGORY_ICON[data.category]} size={24} aria-hidden />
			</div>
			<div style={bodyStyle}>
				<div style={badgeRowStyle}>
					<Badge label={CATEGORY_LABEL[data.category]} icon={CATEGORY_ICON[data.category]} />
					{data.verifiedHost ? <VerifiedHostBadge /> : null}
					{(data.conditionalBadges ?? []).map((badge) => (
						<Badge
							key={badge}
							label={CONDITIONAL_BADGE[badge].label}
							icon={CONDITIONAL_BADGE[badge].icon}
							variant={CONDITIONAL_BADGE[badge].variant}
						/>
					))}
				</div>

				<header style={headerStyle}>
					{onOpen ? (
						<button type="button" style={titleButtonStyle} onClick={() => onOpen(data.id)}>
							<span style={titleStyle}>{data.title}</span>
						</button>
					) : (
						<span style={titleStyle}>{data.title}</span>
					)}
					<p style={metaStyle}>
<<<<<<< HEAD
						{data.hostName} · {data.location} · {data.opportunityWindow}
=======
						{data.hostName} \u00b7 {data.location} \u00b7 {data.opportunityWindow}
>>>>>>> d1a7a58 (foundation: enable seeker lane (web→ui/contracts deps + refs, DiscoveryCard primitive))
					</p>
				</header>

				<dl style={triadStyle}>
					{TRIAD_ORDER.map((kind) => (
						<div key={kind} style={triadItemStyle}>
							<dt style={triadLabelStyle}>
								<Icon name={TRIAD_META[kind].icon} size={16} aria-hidden />
								<span>{TRIAD_META[kind].label}</span>
							</dt>
							<dd style={triadValueStyle}>{data.triad[kind]}</dd>
						</div>
					))}
				</dl>

				{surface === "matched" && typeof data.matchScore === "number" ? (
					<div>
						<Meter value={data.matchScore} label="Match" />
					</div>
				) : null}

				<div style={footerStyle}>
					{actions ?? (
						<>
							<Button
								variant="secondary"
								icon="action.save"
								onClick={onSave ? () => onSave(data.id) : undefined}
							>
								Save
							</Button>
							<Button
								variant="primary"
								icon="action.apply"
								onClick={onApply ? () => onApply(data.id) : undefined}
							>
								Quick Apply
							</Button>
						</>
					)}
				</div>
			</div>
		</article>
	);
}
