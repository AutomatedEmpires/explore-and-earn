import type { CSSProperties, ReactNode } from "react"

import type {
	BenefitProvision,
	DiscoveryCardConditionalBadge,
	DiscoveryCardSurface,
	MarketplaceCategory,
	OpportunityTriad,
} from "@explore-and-earn/contracts"

import { Badge } from "./Badge"
import { Button } from "./Button"
import { Meter } from "./Meter"
import { Icon, type IconKey } from "./icons"

/**
 * DiscoveryCard — the single shared marketplace card.
 *
 * Rebuilt to the founder-endorsed visual reference (Discovery Card V1 Build
 * Pack, endorsed 2026-06-04). ONE skeleton, varied by `surface`; every surface
 * (Seek / Swipe / Map popup / Community feed / Matched / Boosted / Host
 * applicant review / Admin) renders THIS component.
 *
 * Anatomy (top -> bottom):
 *   1. Framed hero (frame-not-filter). Falls back to the category illustration
 *      when no `coverImageUrl` is resolvable.
 *   2. Identity circle (top-left overlay) — host avatar + verified check.
 *   3. Badge / status stack (top-right overlay) — always-on category badge +
 *      conditional Seasonal / Featured / Boosted badges.
 *   4. Report flag (bottom-right overlay) — opens the report pipeline.
 *   5. Title — the host business name, in the display font.
 *   6. Role row — the position title (category icon + text on one plane).
 *   7. Location row — opens the listing in map view.
 *   8. Begins | Ends date row (falls back to a single window cell).
 *   9. Housing / Meals / Pay triad — Housing & Meals carry a GREEN border when
 *      included (text always states it too; never color-only). Housing & Meals
 *      open their photo buckets.
 *  10. Neutral match Meter (matched surface only).
 *  11. Full-width CTA — Quick Apply (listing) / View Seeker (host dashboard).
 *
 * Seeker-for-host variant: on the `host_applicant_review` surface the same
 * skeleton is fed seeker-shaped data (seeker name as title, seeker photo as
 * hero + avatar, seeker badges) and the CTA becomes "View Seeker".
 *
 * All new fields and handlers are OPTIONAL + additive, so existing consumers
 * keep compiling unchanged.
 */
export interface DiscoveryCardData {
	readonly id: string
	/** Big display-font title. The host BUSINESS name (or seeker name on host dashboard). */
	readonly hostName: string
	/** Legacy field, retained for back-compat; also the fallback for the role row. */
	readonly title: string
	/** Role / position title shown on the role row. Falls back to `title`. */
	readonly positionTitle?: string
	readonly category: MarketplaceCategory
	readonly location: string
	readonly opportunityWindow: string
	readonly triad: OpportunityTriad
	readonly verifiedHost?: boolean
	readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[]
	readonly matchScore?: number
	/** Resolved hero photo URL. Absent -> category illustration (frame-not-filter). */
	readonly coverImageUrl?: string
	/** Identity circle avatar URL. Absent -> profile glyph. */
	readonly hostAvatarUrl?: string
	/** Start of the opportunity window (renders the Begins cell when paired with `ends`). */
	readonly begins?: string
	/** End of the opportunity window (renders the Ends cell when paired with `begins`). */
	readonly ends?: string
	/** Provision per benefit; drives the green included-border on Housing & Meals. */
	readonly benefitProvision?: {
		readonly housing: BenefitProvision
		readonly meals: BenefitProvision
		readonly pay: BenefitProvision
	}
}

export interface DiscoveryCardProps {
	readonly data: DiscoveryCardData
	readonly surface: DiscoveryCardSurface
	/** Open the listing detail (or seeker resume on host dashboard). */
	readonly onOpen?: (id: string) => void
	/** Retained for back-compat; surfaces that need a save affordance pass `actions`. */
	readonly onSave?: (id: string) => void
	readonly onApply?: (id: string) => void
	/** Identity circle -> host (or seeker) profile popup. */
	readonly onHostClick?: (id: string) => void
	/** Location row -> listing in map view. */
	readonly onLocationClick?: (id: string) => void
	/** Housing cell -> housing photo bucket. */
	readonly onHousingClick?: (id: string) => void
	/** Meals cell -> meals photo bucket. */
	readonly onMealsClick?: (id: string) => void
	/** Report flag -> report-listing pipeline. */
	readonly onReport?: (id: string) => void
	/** Override the default action row. */
	readonly actions?: ReactNode
}

const CATEGORY_ICON = {
	farm: "category.farm",
	maritime: "category.maritime",
	remote: "category.remote",
	seasonal: "category.seasonal",
	mix: "category.mix",
} satisfies Record<MarketplaceCategory, IconKey>

const CATEGORY_LABEL = {
	farm: "Farm",
	maritime: "Maritime",
	remote: "Remote",
	seasonal: "Seasonal",
	mix: "Mix",
} satisfies Record<MarketplaceCategory, string>

const MAPPIN_ICON = {
	farm: "mappin.farm",
	maritime: "mappin.maritime",
	remote: "mappin.remote",
	seasonal: "mappin.seasonal",
	mix: "mappin.mix",
} satisfies Record<MarketplaceCategory, IconKey>

const CONDITIONAL_BADGE = {
	seasonal: { label: "Seasonal", variant: "seasonal", icon: "category.seasonal" },
	featured: { label: "Featured", variant: "featured", icon: "trust.featured_employer" },
	boosted: { label: "Boosted", variant: "boosted", icon: "status.boosted" },
} satisfies Record<
	DiscoveryCardConditionalBadge,
	{ label: string; variant: "seasonal" | "featured" | "boosted"; icon: IconKey }
>

const cardStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
	background: "var(--color-surface-raised)",
	borderWidth: 1,
	borderStyle: "solid",
	borderColor: "var(--border-ink)",
	borderRadius: "var(--radius-card)",
	color: "var(--text-primary)",
}

const heroStyle: CSSProperties = {
	position: "relative",
	width: "100%",
	aspectRatio: "16 / 11",
	background: "var(--color-surface)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
}

const heroImgStyle: CSSProperties = {
	width: "100%",
	height: "100%",
	objectFit: "cover",
	display: "block",
}

const heroFallbackStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "100%",
	height: "100%",
	color: "var(--text-secondary)",
}

const hostWrapStyle: CSSProperties = {
	position: "absolute",
	top: "var(--space-12)",
	left: "var(--space-12)",
}

const hostCircleStyle: CSSProperties = {
	width: "52px",
	height: "52px",
	borderRadius: "var(--radius-pill)",
	background: "var(--color-surface-raised)",
	borderWidth: 1,
	borderStyle: "solid",
	borderColor: "var(--border-ink)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: 0,
	cursor: "pointer",
	overflow: "hidden",
	position: "relative",
	color: "var(--text-primary)",
}

const hostAvatarImgStyle: CSSProperties = {
	width: "100%",
	height: "100%",
	objectFit: "cover",
}

const verifiedDotStyle: CSSProperties = {
	position: "absolute",
	right: "-2px",
	bottom: "-2px",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	background: "var(--color-surface-raised)",
	borderRadius: "var(--radius-pill)",
	color: "var(--status-verified_host-fg)",
}

const badgeStackStyle: CSSProperties = {
	position: "absolute",
	top: "var(--space-12)",
	right: "var(--space-12)",
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-8)",
	alignItems: "flex-end",
}

const reportButtonStyle: CSSProperties = {
	position: "absolute",
	right: "var(--space-12)",
	bottom: "var(--space-12)",
	width: "36px",
	height: "36px",
	borderRadius: "var(--radius-pill)",
	background: "var(--color-surface-raised)",
	borderWidth: 1,
	borderStyle: "solid",
	borderColor: "var(--border-ink)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: 0,
	cursor: "pointer",
	color: "var(--text-secondary)",
}

const bodyStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-12)",
	padding: "var(--space-card)",
}

const headerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-4)",
}

const titleButtonStyle: CSSProperties = {
	margin: 0,
	padding: 0,
	borderWidth: 0,
	borderStyle: "none",
	background: "none",
	textAlign: "left",
	cursor: "pointer",
	color: "inherit",
}

const titleStyle: CSSProperties = {
	fontFamily: "var(--font-display)",
	fontSize: "var(--type-page-size)",
	lineHeight: "var(--type-page-lh)",
	color: "var(--text-primary)",
}

const infoRowStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "var(--space-8)",
	padding: "var(--space-12)",
	border: "1px solid var(--border-soft)",
	borderRadius: "var(--radius-cell)",
	background: "var(--color-surface)",
	color: "var(--text-primary)",
}

const infoRowButtonStyle: CSSProperties = {
	...infoRowStyle,
	width: "100%",
	cursor: "pointer",
	textAlign: "left",
	font: "inherit",
}

const infoTextStyle: CSSProperties = {
	margin: 0,
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-body-size)",
	lineHeight: "var(--type-body-lh)",
	color: "var(--text-primary)",
}

const labelStyle: CSSProperties = {
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-label-size)",
	lineHeight: "var(--type-label-lh)",
	fontWeight: 600,
	letterSpacing: "var(--type-label-tracking)",
	textTransform: "uppercase",
	color: "var(--text-secondary)",
}

const valueStyle: CSSProperties = {
	margin: 0,
	fontFamily: "var(--font-ui)",
	fontSize: "var(--type-meta-size)",
	lineHeight: "var(--type-meta-lh)",
	color: "var(--text-primary)",
}

const dateContainerStyle: CSSProperties = {
	display: "flex",
	border: "1px solid var(--border-soft)",
	borderRadius: "var(--radius-cell)",
	overflow: "hidden",
}

const dateCellStyle: CSSProperties = {
	flex: 1,
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-2)",
	padding: "var(--space-12)",
}

const dateCellRightStyle: CSSProperties = {
	...dateCellStyle,
	borderLeft: "1px solid var(--border-soft)",
}

const triadStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "1fr 1fr 1fr",
	gap: "var(--space-8)",
	margin: 0,
}

const triadItemStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "var(--space-8)",
	padding: "var(--space-12)",
	borderWidth: 1,
	borderStyle: "solid",
	borderColor: "var(--border-soft)",
	borderRadius: "var(--radius-cell)",
	background: "var(--color-surface)",
	textAlign: "left",
	width: "100%",
	color: "var(--text-primary)",
}

const triadItemIncludedStyle: CSSProperties = {
	...triadItemStyle,
	borderColor: "var(--status-success-fg)",
}

const triadButtonStyle: CSSProperties = {
	...triadItemStyle,
	cursor: "pointer",
	font: "inherit",
}

const triadButtonIncludedStyle: CSSProperties = {
	...triadItemIncludedStyle,
	cursor: "pointer",
	font: "inherit",
}

const triadTextStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-2)",
	minWidth: 0,
}

const meterWrapStyle: CSSProperties = {
	margin: 0,
}

const footerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--space-8)",
}

const ctaButtonStyle: CSSProperties = {
	width: "100%",
	justifyContent: "center",
}

export function DiscoveryCard({
	data,
	surface,
	onOpen,
	onApply,
	onHostClick,
	onLocationClick,
	onHousingClick,
	onMealsClick,
	onReport,
	actions,
}: DiscoveryCardProps) {
	const category = data.category
	const roleText = data.positionTitle ?? data.title
	const verified = data.verifiedHost === true
	const isSeekerSurface = surface === "host_applicant_review"

	const ctaLabel = isSeekerSurface ? "View Seeker" : "Quick Apply"
	const ctaIcon: IconKey = isSeekerSurface ? "action.forward" : "action.apply"
	const ctaHandler = isSeekerSurface
		? onOpen
			? () => onOpen(data.id)
			: undefined
		: onApply
			? () => onApply(data.id)
			: undefined

	// G22: the verified-host qualifier is ALWAYS "Self-Declared by Host".
	const hostAriaLabel = verified
		? data.hostName + " - Verified Host (Self-Declared by Host)"
		: data.hostName

	const housingIncluded = data.benefitProvision
		? data.benefitProvision.housing !== "not_provided"
		: false
	const mealsIncluded = data.benefitProvision
		? data.benefitProvision.meals !== "not_provided"
		: false

	const hasDateRange = Boolean(data.begins) && Boolean(data.ends)

	return (
		<article style={cardStyle} data-category={category} data-surface={surface}>
			<div style={heroStyle}>
				{data.coverImageUrl ? (
					<img
						src={data.coverImageUrl}
						alt={data.hostName + " cover photo"}
						style={heroImgStyle}
					/>
				) : (
					<div style={heroFallbackStyle}>
						<Icon name={CATEGORY_ICON[category]} size={24} aria-hidden />
					</div>
				)}

				<div style={hostWrapStyle}>
					<button
						type="button"
						style={hostCircleStyle}
						onClick={onHostClick ? () => onHostClick(data.id) : undefined}
						aria-label={hostAriaLabel}
					>
						{data.hostAvatarUrl ? (
							<img src={data.hostAvatarUrl} alt="" style={hostAvatarImgStyle} />
						) : (
							<Icon name="nav.profile" size={24} aria-hidden />
						)}
						{verified ? (
							<span style={verifiedDotStyle}>
								<Icon name="trust.verified_host" size={16} aria-hidden />
							</span>
						) : null}
					</button>
				</div>

				<div style={badgeStackStyle}>
					<Badge label={CATEGORY_LABEL[category]} icon={CATEGORY_ICON[category]} />
					{(data.conditionalBadges ?? []).map((badge) => (
						<Badge
							key={badge}
							label={CONDITIONAL_BADGE[badge].label}
							icon={CONDITIONAL_BADGE[badge].icon}
							variant={CONDITIONAL_BADGE[badge].variant}
						/>
					))}
				</div>

				{onReport ? (
					<button
						type="button"
						style={reportButtonStyle}
						onClick={() => onReport(data.id)}
						aria-label="Report listing"
					>
						<Icon name="action.report" size={20} aria-hidden />
					</button>
				) : null}
			</div>

			<div style={bodyStyle}>
				<header style={headerStyle}>
					{onOpen ? (
						<button type="button" style={titleButtonStyle} onClick={() => onOpen(data.id)}>
							<span style={titleStyle}>{data.hostName}</span>
						</button>
					) : (
						<span style={titleStyle}>{data.hostName}</span>
					)}
				</header>

				<div style={infoRowStyle}>
					<Icon name={CATEGORY_ICON[category]} size={20} aria-hidden />
					<span style={infoTextStyle}>{roleText}</span>
				</div>

				{onLocationClick ? (
					<button
						type="button"
						style={infoRowButtonStyle}
						onClick={() => onLocationClick(data.id)}
					>
						<Icon name={MAPPIN_ICON[category]} size={20} aria-hidden />
						<span style={infoTextStyle}>{data.location}</span>
					</button>
				) : (
					<div style={infoRowStyle}>
						<Icon name={MAPPIN_ICON[category]} size={20} aria-hidden />
						<span style={infoTextStyle}>{data.location}</span>
					</div>
				)}

				<div style={dateContainerStyle}>
					{hasDateRange ? (
						<>
							<div style={dateCellStyle}>
								<span style={labelStyle}>Begins</span>
								<span style={valueStyle}>{data.begins}</span>
							</div>
							<div style={dateCellRightStyle}>
								<span style={labelStyle}>Ends</span>
								<span style={valueStyle}>{data.ends}</span>
							</div>
						</>
					) : (
						<div style={dateCellStyle}>
							<span style={labelStyle}>Dates</span>
							<span style={valueStyle}>{data.opportunityWindow}</span>
						</div>
					)}
				</div>

				<dl style={triadStyle}>
					{onHousingClick && housingIncluded ? (
						<button
							type="button"
							style={triadButtonIncludedStyle}
							onClick={() => onHousingClick(data.id)}
						>
							<Icon name="benefit.housing" size={20} aria-hidden />
							<span style={triadTextStyle}>
								<dt style={labelStyle}>Housing</dt>
								<dd style={valueStyle}>{data.triad.housing}</dd>
							</span>
						</button>
					) : (
						<div style={housingIncluded ? triadItemIncludedStyle : triadItemStyle}>
							<Icon name="benefit.housing" size={20} aria-hidden />
							<span style={triadTextStyle}>
								<dt style={labelStyle}>Housing</dt>
								<dd style={valueStyle}>{data.triad.housing}</dd>
							</span>
						</div>
					)}

					{onMealsClick && mealsIncluded ? (
						<button
							type="button"
							style={triadButtonIncludedStyle}
							onClick={() => onMealsClick(data.id)}
						>
							<Icon name="benefit.meals" size={20} aria-hidden />
							<span style={triadTextStyle}>
								<dt style={labelStyle}>Meals</dt>
								<dd style={valueStyle}>{data.triad.meals}</dd>
							</span>
						</button>
					) : (
						<div style={mealsIncluded ? triadItemIncludedStyle : triadItemStyle}>
							<Icon name="benefit.meals" size={20} aria-hidden />
							<span style={triadTextStyle}>
								<dt style={labelStyle}>Meals</dt>
								<dd style={valueStyle}>{data.triad.meals}</dd>
							</span>
						</div>
					)}

					<div style={triadItemStyle}>
						<Icon name="benefit.pay" size={20} aria-hidden />
						<span style={triadTextStyle}>
							<dt style={labelStyle}>Pay</dt>
							<dd style={valueStyle}>{data.triad.pay}</dd>
						</span>
					</div>
				</dl>

				{surface === "matched" && typeof data.matchScore === "number" ? (
					<div style={meterWrapStyle}>
						<Meter value={data.matchScore} label="Match" />
					</div>
				) : null}

				<div style={footerStyle}>
					{actions ?? (
						<Button
							variant="primary"
							icon={ctaIcon}
							style={ctaButtonStyle}
							onClick={ctaHandler}
						>
							{ctaLabel}
						</Button>
					)}
				</div>
			</div>
		</article>
	)
}
