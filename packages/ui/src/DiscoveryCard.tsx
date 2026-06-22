import type { CSSProperties, ReactNode } from "react"

import type {
	BenefitProvision,
	DiscoveryCardConditionalBadge,
	DiscoveryCardSurface,
	MarketplaceCategory,
	OpportunityTriad,
} from "@explore-and-earn/contracts"

import { Meter } from "./Meter"
import { Icon, type IconKey } from "./icons"
import styles from "./DiscoveryCard.module.css"

/**
 * DiscoveryCard — canonical Explore&Earn listing card.
 *
 * Skeleton (top → bottom) is LOCKED:
 *   1. Image / cover area
 *   2. HOST NAME row
 *   3. JOB TITLE row
 *   4. LOCATION row
 *   5. BEGINS | ENDS row (always 2 equal columns)
 *   6. HOUSING | MEALS | PAY row (always 3 equal columns)
 *   7. QUICK APPLY / state CTA
 *
 * Badge placement rules (locked):
 *   Top-RIGHT  — category stamp (ONE, always); optional secondary below (saved/offered/boosted)
 *   Top-CENTER — featured stamp OR action-state stamp (applied/schedule); never both; max 1
 *   Hero-bar   — fill-quality bar when no center badge and fillPercent is set
 *   Max 3 badges total on image. "seasonal" is a category, never a conditional badge.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DiscoveryCardData {
	readonly id: string
	readonly hostName: string
	readonly title: string
	readonly positionTitle?: string
	readonly category: MarketplaceCategory
	readonly location: string
	readonly opportunityWindow: string
	readonly triad: OpportunityTriad
	readonly verifiedHost?: boolean
	readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[]
	readonly matchScore?: number
	readonly coverImageUrl?: string
	readonly hostAvatarUrl?: string
	readonly begins?: string
	readonly ends?: string
	readonly benefitProvision?: {
		readonly housing: BenefitProvision
		readonly meals: BenefitProvision
		readonly pay: BenefitProvision
	}
	readonly housingOccupancy?: "solo" | "shared"
	readonly fillPercent?: number
	/** Top skills shown in place of H/M/P on host_applicant_review surface (max 3) */
	readonly skills?: readonly string[]
	/** Number of active reports on this listing — shown on admin_review surface */
	readonly reportCount?: number
	/** Most common report category — shown on admin_review surface */
	readonly reportCategory?: string
}

export interface DiscoveryCardProps {
	readonly data: DiscoveryCardData
	readonly surface: DiscoveryCardSurface
	readonly variant?: "default" | "compact" | "featured" | "disabled"
	readonly onOpen?: (id: string) => void
	readonly onSave?: (id: string) => void
	readonly onApply?: (id: string) => void
	readonly onHostClick?: (id: string) => void
	readonly onLocationClick?: (id: string) => void
	readonly onHousingClick?: (id: string) => void
	readonly onMealsClick?: (id: string) => void
	readonly onPayClick?: (id: string) => void
	readonly onReport?: (id: string) => void
	readonly onSkip?: (id: string) => void
	readonly onSchedule?: (id: string) => void
	readonly onApprove?: (id: string) => void
	readonly onWarn?: (id: string) => void
	readonly onRemove?: (id: string) => void
	readonly actions?: ReactNode
	readonly cardState?:
		| "saved" | "applied" | "offered" | "scheduled"
		| "accepted" | "matched" | "not_selected" | "withdrawn"
		| "draft" | "paused" | "expired" | "filled"
		| "invited" | "reported"
}

// ─── Palette ─────────────────────────────────────────────────────────────────

// V2 "Golden Hour Hybrid" — warm ink + warm surface, via tokens (no raw hex).
const INK       = "var(--palette-ink)"
const INK_SOFT  = "var(--palette-ink-muted)"
const PAPER     = "var(--palette-surface)"

const H_INK = "color-mix(in srgb, var(--palette-teal) 78%, var(--palette-ink))"   /* teal — housing/meals available */
const P_INK = "color-mix(in srgb, var(--palette-amber) 52%, var(--palette-ink))"  /* deep gold — pay (money) */


const CAT_LABEL: Record<MarketplaceCategory, string> = {
	farm: "Farm", maritime: "Maritime", remote: "Remote", seasonal: "Seasonal", mix: "Mix",
}

const CAT_ICON: Record<MarketplaceCategory, IconKey> = {
	farm: "category.farm", maritime: "category.maritime", remote: "category.remote",
	seasonal: "category.seasonal", mix: "category.mix",
}

const MAPPIN: Record<MarketplaceCategory, IconKey> = {
	farm: "mappin.farm", maritime: "mappin.maritime", remote: "mappin.remote",
	seasonal: "mappin.seasonal", mix: "mappin.mix",
}

// ─── Benefit helpers ──────────────────────────────────────────────────────────
//
// Housing & Meals share a green/red signal: provided = green, not_provided = light red.
// Pay is always blue — it always has a dollar value so it never reads as "unavailable".

// "Not provided" is information, not an error — muted neutral, never alarming red.
const RED_INK = "var(--palette-ink-muted)"

// Housing / Meals — provided = warm teal, not-provided = muted neutral
const HM_GREEN_BG     = "color-mix(in srgb, var(--palette-teal) 13%, var(--palette-surface))"
const HM_GREEN_BORDER = `1.5px solid color-mix(in srgb, var(--palette-teal) 42%, var(--palette-line))`
const HM_GREEN_SHADOW = "var(--elevation-card)"
const HM_RED_BG       = "color-mix(in srgb, var(--palette-ink) 4%, var(--palette-surface))"
const HM_RED_BORDER   = "1px solid var(--palette-line)"
const HM_RED_SHADOW   = "none"

// partial is treated identically to provided — "available" is the single signal
function hmBg(p: BenefitProvision | undefined):     string { return (p === "provided" || p === "partial") ? HM_GREEN_BG     : HM_RED_BG     }
function hmBorder(p: BenefitProvision | undefined): string { return (p === "provided" || p === "partial") ? HM_GREEN_BORDER : HM_RED_BORDER }
function hmColor(p: BenefitProvision | undefined):  string { return (p === "provided" || p === "partial") ? H_INK           : RED_INK       }
function hmShadow(p: BenefitProvision | undefined): string { return (p === "provided" || p === "partial") ? HM_GREEN_SHADOW : HM_RED_SHADOW }

// Pay — always blue regardless of provision
// Pay — always present (money), warm gold accent
const PAY_BG     = "color-mix(in srgb, var(--palette-amber) 15%, var(--palette-surface))"
const PAY_BORDER = `1.5px solid color-mix(in srgb, var(--palette-amber) 52%, var(--palette-line))`
const PAY_COLOR  = P_INK
const PAY_SHADOW = "var(--elevation-card)"

// ─── Fill bar helpers ─────────────────────────────────────────────────────────

function fillCopy(pct: number): string {
	if (pct >= 90) return "Almost full"
	if (pct >= 70) return "Filling fast"
	if (pct >= 45) return "Filling up"
	return "Open spots"
}

// ─── Type fonts ───────────────────────────────────────────────────────────────

const DISPLAY_FONT = "var(--font-display)"
const UI_FONT      = "var(--font-ui)"

// ─── Static styles ────────────────────────────────────────────────────────────

/** Parchment stamp — base for all overlay badges. No border — shadow provides definition. */
const STAMP: CSSProperties = {
	display: "inline-flex", alignItems: "center", gap: "5px",
	padding: "5px 11px", borderRadius: "8px",
	fontFamily: DISPLAY_FONT,
	fontSize: "11px", fontWeight: 700,
	letterSpacing: "0.08em", textTransform: "uppercase",
	background: "color-mix(in srgb, var(--palette-paper) 88%, var(--palette-amber))",
	backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
	boxShadow: "var(--elevation-card), 0 1px 0 rgba(255,255,255,0.55) inset",
	whiteSpace: "nowrap",
}

/** Info row cell (name / job / location) — clean warm tray, V2 soft depth */
const ROW_CELL: CSSProperties = {
	display: "flex", alignItems: "center", justifyContent: "center",
	gap: "6px", padding: "10px 14px",
	background: PAPER, border: "1px solid var(--palette-line)",
	borderRadius: "12px", textAlign: "center",
	boxShadow: "var(--elevation-card)",
}

/** Strip cell — stacked (begins/ends columns) — clean warm tray */
const STRIP_CELL: CSSProperties = {
	display: "flex", flexDirection: "column",
	alignItems: "center", justifyContent: "center",
	gap: "3px", padding: "9px 6px",
	background: PAPER, border: "1px solid var(--palette-line)",
	borderRadius: "12px", textAlign: "center",
	boxShadow: "var(--elevation-card)",
}

/** Benefit cell — inline icon + label (housing / meals / pay) */
const BENEFIT_CELL: CSSProperties = {
	display: "flex", flexDirection: "row",
	alignItems: "center", justifyContent: "center",
	gap: "5px", padding: "9px 6px",
	background: PAPER, borderRadius: "10px", textAlign: "center",
}

const hostNameText: CSSProperties = {
	fontFamily: DISPLAY_FONT, fontSize: "clamp(15px, 4.0vw, 18px)",
	fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
	lineHeight: 1.15, color: INK, textAlign: "center",
	textShadow: "0 1px 0 rgba(255,255,255,0.65)",
}

const jobTitleText: CSSProperties = {
	fontFamily: DISPLAY_FONT, fontSize: "clamp(13px, 3.4vw, 16px)",
	fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
	lineHeight: 1.2, color: INK, textAlign: "center",
}

const locationText: CSSProperties = {
	fontFamily: UI_FONT, fontSize: "clamp(12px, 2.8vw, 14px)",
	fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
	color: INK, textAlign: "center",
}

const stripLabel: CSSProperties = {
	fontFamily: DISPLAY_FONT, fontSize: "clamp(10px, 2.2vw, 12px)",
	fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
	lineHeight: 1, color: INK,
}

const stripValue: CSSProperties = {
	fontFamily: UI_FONT, fontSize: "clamp(10px, 2.2vw, 12px)",
	fontWeight: 600, color: INK, textAlign: "center", lineHeight: 1.2,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiscoveryCard({
	data,
	surface,
	variant = "default",
	cardState,
	onOpen,
	onSave,
	onApply,
	onHostClick,
	onLocationClick,
	onHousingClick,
	onMealsClick,
	onPayClick,
	onReport,
	onSkip,
	onSchedule,
	onApprove,
	onWarn,
	onRemove,
	actions,
}: DiscoveryCardProps) {
	const cat      = data.category
	const roleText = data.positionTitle ?? data.title
	// Don't render placeholder content as if it were real — hide an empty/unknown
	// location, and collapse the begins|ends strip to the opportunity window when
	// no concrete dates exist (so the card never shows "LOCATION NOT SPECIFIED" or
	// a row of em-dashes).
	const hasLocation = Boolean(data.location) && data.location !== "Location not specified"
	const hasDates    = Boolean(data.begins || data.ends)
	const cellBg          = "var(--cat-cell)"
	const ROW_CELL_CAT:   CSSProperties = { ...ROW_CELL,   background: cellBg }
	const STRIP_CELL_CAT: CSSProperties = { ...STRIP_CELL, background: cellBg }
	const verified = data.verifiedHost === true
	const isDisabled            = variant === "disabled"
	const isApplicantReview     = surface === "host_applicant_review"
	const isAdminReview         = surface === "admin_review"
	const isSeekerSurface       = isApplicantReview  // alias kept for CTA compat
	const circleLabel           = isApplicantReview ? "SEEKER" : "HOST"

	const hp = data.benefitProvision?.housing
	const mp = data.benefitProvision?.meals

	const canOpenHousing = Boolean(onHousingClick && hp !== "not_provided")
	const canOpenMeals   = Boolean(onMealsClick   && mp !== "not_provided")

	// "seasonal" is a category; "featured" is not a platform concept — only "boosted" is valid
	const isBoosted = (data.conditionalBadges ?? []).includes("boosted")

	// ── Badge slot resolution ─────────────────────────────────────────────────
	//
	// TOP-CENTER slot (max 1):
	//   applied state → "APPLIED"  stamp
	//   scheduled state → "SCHEDULE" stamp
	//   featured listing (default) → "FEATURED" stamp
	//   otherwise → hero fill bar (when fillPercent available)
	//
	// TOP-RIGHT slot (always category + optional 1 secondary):
	//   [0] Category stamp (always, ONE)
	//   [1] saved/offered state or boosted badge (optional)
	//
	const isApplied     = cardState === "applied"
	const isOffered     = cardState === "offered"
	const isScheduled   = cardState === "scheduled"
	const isSaved       = cardState === "saved"
	const isAccepted    = cardState === "accepted"
	const isMatched     = cardState === "matched"
	const isNotSelected = cardState === "not_selected"
	const isWithdrawn   = cardState === "withdrawn"
	const isDraft       = cardState === "draft"
	const isPaused      = cardState === "paused"
	const isExpired     = cardState === "expired"
	const isFilled      = cardState === "filled"
	const isInvited     = cardState === "invited"
	const isReported    = cardState === "reported"

	// Center-top slot: action states > boosted > fill bar
	// Priority: applied > scheduled > draft > filled > boosted (with ⚡ icon, amber gradient)
	type CenterBadge = { label: string; color: string; bg?: string; icon?: IconKey; decoration: boolean }
	const centerBadge: CenterBadge | null =
		isApplied    ? { label: "Applied",  color: INK,    decoration: false }
		: isScheduled ? { label: "Schedule", color: INK,    decoration: true  }
		: isDraft     ? { label: "Draft",    color: INK,    decoration: false }
		: isFilled    ? { label: "Filled",   color: "var(--palette-paper)", bg: "var(--status-success-fg)", decoration: false }
		: isReported  ? { label: data.reportCount ? `${data.reportCount} Reports` : "Reported", color: "var(--palette-paper)", bg: "var(--status-error-fg)", decoration: false }
		: isBoosted   ? { label: "Boosted",  color: "var(--palette-paper)", bg: "var(--palette-amber)", icon: "status.boosted" as IconKey, decoration: false }
		: null

	// R1 right secondary: passive state badges only (boosted moved to center)
	// When boosted+matched conflict: boosted takes center, match score surfaces here as "92% Match"
	type SecondaryBadge = { label: string; ink: string }
	const matchBadgeLabel = typeof data.matchScore === "number" ? `${data.matchScore}% Match` : "Matched"
	const secondaryBadge: SecondaryBadge | null =
		isSaved       ? { label: "Saved",          ink: "var(--status-success-fg)" }
		: isOffered   ? { label: "Offered",         ink: "var(--status-success-fg)" }
		: isAccepted  ? { label: "Accepted",        ink: "var(--status-success-fg)" }
		: isMatched   ? { label: matchBadgeLabel,   ink: "var(--palette-teal)" }
		: isInvited   ? { label: "Invited",         ink: "var(--status-warning-fg)" }
		: isNotSelected ? { label: "Passed",        ink: INK_SOFT  }
		: isWithdrawn ? { label: "Withdrawn",       ink: INK_SOFT  }
		: isPaused    ? { label: "Paused",          ink: "var(--status-warning-fg)" }
		: isExpired   ? { label: "Expired",         ink: INK_SOFT  }
		: isReported && data.reportCategory ? { label: data.reportCategory, ink: "var(--status-error-fg)" }
		: null

	// Match bar: always-on for host_applicant_review (boosted doesn't apply to seeker cards);
	// on other surfaces, only when matched + no center badge (boosted wins center, score falls to R1)
	const showMatchBar = isApplicantReview
		? typeof data.matchScore === "number"
		: !centerBadge && isMatched && typeof data.matchScore === "number"
	const showHeroBar  = !centerBadge && !showMatchBar && typeof data.fillPercent === "number"

	// ── CTA resolution ────────────────────────────────────────────────────────
	const ctaLabel =
		isApplied     ? "Applied"
		: isOffered   ? "Accept"
		: isScheduled ? "Schedule"
		: isAccepted  ? "View Details"
		: isMatched   ? "Quick Apply"
		: isInvited   ? "View Invite"
		: isReported  ? "Under Review"
		: isNotSelected ? "Not Selected"
		: isWithdrawn ? "Re-Apply"
		: isDraft     ? "Edit Draft"
		: isPaused    ? "Resume"
		: isExpired   ? "Renew"
		: isFilled    ? "Close"
		: isSaved     ? "Quick Apply"
		: isSeekerSurface ? "View Seeker"
		: onApply     ? "Quick Apply"
		:               "Open Role"

	const ctaDisabled = isApplied || isNotSelected || isReported || isDisabled
	const ctaHandler  = ctaDisabled ? undefined
		: isSeekerSurface ? (onOpen ? () => onOpen(data.id) : undefined)
		: isScheduled ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isOffered   ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isAccepted  ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isInvited   ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isWithdrawn ? (onApply ? () => onApply(data.id) : onOpen ? () => onOpen(data.id) : undefined)
		: isMatched   ? (onApply ? () => onApply(data.id) : onOpen ? () => onOpen(data.id) : undefined)
		: isDraft     ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isPaused    ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isExpired   ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isFilled    ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: onApply     ? () => onApply(data.id)
		: onOpen      ? () => onOpen(data.id)
		: undefined

	const titleHandler = onHostClick ? () => onHostClick(data.id)
		: onOpen ? () => onOpen(data.id) : undefined

	// ── Dynamic card styles ───────────────────────────────────────────────────

	const cardStyle: CSSProperties = {
		position: "relative",
		display: "flex", flexDirection: "column",
		width: "min(100%, 360px)",
		overflow: "hidden",
		background: "var(--cat-body)",
		border: `1px solid var(--palette-line)`,
		borderTop: `3px solid var(--cat-accent)`,
		borderRadius: "20px",
		color: INK,
		opacity: isDisabled ? 0.6 : 1,
		boxShadow: [
			"inset 0 1px 0 rgba(255,255,255,0.55)",        /* top catch-light */
			`inset 0 -44px 56px var(--cat-glow)`,         /* category ambient from below */
			"var(--elevation-card)",                        /* V2 soft depth */
		].join(", "),
	}

	const heroStyle: CSSProperties = {
		position: "relative", width: "100%", aspectRatio: "16 / 10",
		overflow: "hidden", flexShrink: 0,
		background: "var(--cat-cover)",
		borderBottom: `1px solid var(--palette-line)`,
	}

	const hostCircle: CSSProperties = {
		width: "var(--dc-host-size, 74px)", height: "var(--dc-host-size, 74px)",
		borderRadius: "50%",
		border: "3px solid rgba(255,248,225,0.95)",
		// dark ring + category-colored glow ring + deep shadow
		boxShadow: `0 0 0 2.5px ${INK}, 0 0 0 5px var(--cat-accent), 0 6px 20px rgba(26,43,60,0.40)`,
		background: data.hostAvatarUrl ? "transparent" : "rgba(255,248,225,0.22)",
		backdropFilter: data.hostAvatarUrl ? "none" : "blur(4px)",
		WebkitBackdropFilter: data.hostAvatarUrl ? "none" : "blur(4px)",
		display: "flex", alignItems: "center", justifyContent: "center",
		overflow: "hidden", cursor: onHostClick ? "pointer" : "default", padding: 0,
		color: PAPER, flexShrink: 0,
	}

	const isPassiveCta = isApplied || isNotSelected || isReported || isDisabled
	const ctaBg        = isPassiveCta ? "transparent" : INK
	const ctaColor     = isPassiveCta ? INK_SOFT      : PAPER
	const ctaBorderVal = isPassiveCta ? `1.5px solid rgba(26,43,60,0.22)` : `2.5px solid ${INK}`
	const ctaShadow    = isPassiveCta ? "none"
		: `4px 5px 0 rgba(26,43,60,0.36), inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -2px 0 rgba(0,0,0,0.12)`

	const housingCell: CSSProperties = {
		...BENEFIT_CELL,
		border: hmBorder(hp), background: hmBg(hp), color: hmColor(hp),
		boxShadow: hmShadow(hp),
		...(canOpenHousing ? { cursor: "pointer", width: "100%" } : {}),
	}
	const mealsCell: CSSProperties = {
		...BENEFIT_CELL,
		border: hmBorder(mp), background: hmBg(mp), color: hmColor(mp),
		boxShadow: hmShadow(mp),
		...(canOpenMeals ? { cursor: "pointer", width: "100%" } : {}),
	}
	const payCell: CSSProperties = {
		...BENEFIT_CELL,
		border: PAY_BORDER, background: PAY_BG, color: PAY_COLOR,
		boxShadow: PAY_SHADOW,
		...(onPayClick ? { cursor: "pointer", width: "100%" } : {}),
	}

	return (
		<>
		{/* Hover expand for interactive benefit cells — scoped by component class */}
		<style>{`
			.ui-card--discovery .dc-benefit-btn {
				transition: transform 120ms ease, box-shadow 120ms ease;
			}
			.ui-card--discovery .dc-benefit-btn:hover {
				transform: scale(1.05) translateY(-1px);
			}
		`}</style>
		<article
			className={`ui-card--discovery ${styles.card}`}
			style={cardStyle}
			data-category={cat}
			data-surface={surface}
			data-variant={variant}
			data-state={cardState ?? "default"}
		>
			{/* ── 1. IMAGE / COVER AREA ── */}
			<div style={heroStyle}>
				{data.coverImageUrl ? (
					<img
						src={data.coverImageUrl}
						alt={`${data.hostName} cover`}
						style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
					/>
				) : (
					/* No cover yet — a large category watermark so the frame reads as
					   intentional, not empty (placeholder, not a filter on a photo). */
					<span
						aria-hidden
						style={{
							position: "absolute", inset: 0,
							display: "flex", alignItems: "center", justifyContent: "center",
							color: "rgba(255,255,255,0.40)",
							transform: "scale(2.7)",
							filter: "drop-shadow(0 2px 6px rgba(23,19,13,0.18))",
						}}
					>
						<Icon name={CAT_ICON[cat]} size={24} />
					</span>
				)}

				{/* Gradient scrim — top shadow for badges, bottom shadow, warm golden side wash */}
				<div
					style={{
						position: "absolute", inset: 0, pointerEvents: "none",
						background: [
							"linear-gradient(180deg, rgba(23,19,13,0.50) 0%, transparent 32%)",
							"linear-gradient(0deg, rgba(23,19,13,0.28) 0%, transparent 28%)",
							`linear-gradient(105deg, rgba(201,139,27,0.18) 0%, transparent 55%)`,
						].join(", "),
					}}
					aria-hidden
				/>

				{/* ── HOST BADGE (top-left) ── */}
				<div style={{ position: "absolute", top: "12px", left: "12px", zIndex: 3, display: "inline-block" }}>
					<button
						type="button"
						style={hostCircle}
						onClick={onHostClick ? () => onHostClick(data.id) : undefined}
						aria-label={verified ? `${data.hostName} — Verified Host` : data.hostName}
					>
						{data.hostAvatarUrl ? (
							<img
								src={data.hostAvatarUrl}
								alt={`${data.hostName} host avatar`}
								style={{ width: "100%", height: "100%", objectFit: "cover" }}
							/>
						) : (
							<span style={{
								fontFamily: DISPLAY_FONT, fontSize: "clamp(10px, 2.6vw, 13px)",
								fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase",
								color: PAPER, textShadow: "0 1px 3px rgba(23,19,13,0.4)",
								lineHeight: 1, userSelect: "none",
							}}>
								{circleLabel}
							</span>
						)}
					</button>

					{/* Verified check — listing surfaces only; not shown on applicant review */}
					{verified && !isApplicantReview ? (
						<span
							style={{
								position: "absolute", bottom: "-4px", right: "-4px", zIndex: 4,
								width: "18px", height: "18px", borderRadius: "50%",
								background: "var(--palette-teal)",
								border: "2px solid var(--palette-surface)",
								boxShadow: `0 0 0 1px ${INK}, 0 2px 6px rgba(0,0,0,0.32)`,
								display: "flex", alignItems: "center", justifyContent: "center",
								color: "var(--palette-paper)", flexShrink: 0,
							}}
							aria-label="Verified Host"
						>
							<Icon name="trust.verified_host" size={16} aria-hidden />
						</span>
					) : null}
				</div>

				{/* ── CENTER-TOP SLOT: state/featured badge OR fill-quality bar ── */}

				{centerBadge ? (
					/* Action / boosted stamp — top-center */
					<div style={{
						position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)",
						zIndex: 3, display: "inline-flex", alignItems: "center",
					}}>
						<span style={{
							...STAMP,
							color: centerBadge.color,
							...(centerBadge.bg ? {
								background: centerBadge.bg,
								boxShadow: "0 3px 14px rgba(23,19,13,0.34), 0 1px 0 rgba(255,255,255,0.25) inset",
							} : {}),
						}}>
							{centerBadge.icon && <Icon name={centerBadge.icon} size={16} aria-hidden />}
							{centerBadge.decoration && (
								<span aria-hidden style={{ fontFamily: UI_FONT, fontSize: "11px", opacity: 0.6, letterSpacing: 0 }}>≥—</span>
							)}
							{centerBadge.label}
							{centerBadge.decoration && (
								<span aria-hidden style={{ fontFamily: UI_FONT, fontSize: "11px", opacity: 0.6, letterSpacing: 0 }}>—≤</span>
							)}
						</span>
					</div>
				) : showMatchBar && data.matchScore !== undefined ? (
					/* Match score bar — same slot as fill bar; pointer shows your fit */
					<div style={{
						position: "absolute", top: "16px",
						left: "calc(var(--dc-host-size, 74px) + 22px)",
						right: "92px",
						zIndex: 3,
						display: "flex", flexDirection: "column", alignItems: "stretch", gap: "3px",
					}}>
						<div style={{ position: "relative", height: "8px" }}>
							<div style={{
								position: "absolute",
								left: `${Math.min(96, Math.max(4, data.matchScore))}%`,
								transform: "translateX(-50%)",
								width: 0, height: 0,
								borderLeft: "5px solid transparent",
								borderRight: "5px solid transparent",
								borderTop: `7px solid ${INK}`,
							}} />
						</div>
						<div style={{
							height: "9px", borderRadius: "5px",
							border: "1.5px solid rgba(23,19,13,0.30)",
							background: "linear-gradient(90deg, var(--status-error-fg) 0%, var(--palette-amber) 48%, var(--status-success-fg) 100%)",
							boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
						}} />
						<div style={{
							textAlign: "center",
							fontFamily: UI_FONT, fontSize: "9px", fontWeight: 700,
							letterSpacing: "0.06em", textTransform: "uppercase",
							color: PAPER, textShadow: "0 1px 2px rgba(23,19,13,0.5)",
							lineHeight: 1,
						}}>
							{data.matchScore}% Match
						</div>
					</div>
				) : showHeroBar && data.fillPercent !== undefined ? (
					/* Fill-quality bar — listing scarcity signal */
					<div style={{
						position: "absolute", top: "16px",
						left: "calc(var(--dc-host-size, 74px) + 22px)",
						right: "92px",
						zIndex: 3,
						display: "flex", flexDirection: "column", alignItems: "stretch", gap: "3px",
					}}>
						<div style={{ position: "relative", height: "8px" }}>
							<div style={{
								position: "absolute",
								left: `${Math.min(96, Math.max(4, data.fillPercent))}%`,
								transform: "translateX(-50%)",
								width: 0, height: 0,
								borderLeft: "5px solid transparent",
								borderRight: "5px solid transparent",
								borderTop: `7px solid ${INK}`,
							}} />
						</div>
						<div style={{
							height: "9px", borderRadius: "5px",
							border: "1.5px solid rgba(23,19,13,0.30)",
							background: "linear-gradient(90deg, var(--status-error-fg) 0%, var(--palette-amber) 48%, var(--status-success-fg) 100%)",
							boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
						}} />
						<div style={{
							textAlign: "center",
							fontFamily: UI_FONT, fontSize: "9px", fontWeight: 700,
							letterSpacing: "0.06em", textTransform: "uppercase",
							color: PAPER, textShadow: "0 1px 2px rgba(23,19,13,0.5)",
							lineHeight: 1,
						}}>
							{fillCopy(data.fillPercent)}
						</div>
					</div>
				) : null}

				{/* ── TOP-RIGHT SLOT: category + optional secondary ── */}
				<div style={{
					position: "absolute", top: "12px", right: "12px", zIndex: 3,
					display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end",
				}}>
					{/* Category stamp — always ONE, always here; colored fill = instant recognition */}
					<span style={{
						...STAMP,
						background: "var(--cat-accent)",
						color: "var(--palette-paper)",
						boxShadow: `0 3px 12px rgba(23,19,13,0.32), 0 1px 0 rgba(255,255,255,0.22) inset`,
					}}>
						<Icon name={CAT_ICON[cat]} size={16} aria-hidden />
						{CAT_LABEL[cat]}
					</span>

					{/* Secondary badge — state indicator (max 1); clean ink-colored ring */}
					{secondaryBadge ? (
						<span style={{
							...STAMP,
							color: secondaryBadge.ink,
							border: `1px solid color-mix(in srgb, ${secondaryBadge.ink} 32%, transparent)`,
						}}>
							{secondaryBadge.label}
						</span>
					) : null}
				</div>

				{/* Report flag — bottom-right */}
				{onReport ? (
					<button
						type="button"
						style={{
							position: "absolute", right: "12px", bottom: "12px", zIndex: 3,
							width: "34px", height: "34px", borderRadius: "50%",
							background: "rgba(255,244,215,0.88)",
							backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
							border: `1.5px solid ${INK_SOFT}`,
							boxShadow: "0 0 0 1px rgba(23,19,13,0.12), 0 2px 8px rgba(0,0,0,0.18)",
							display: "flex", alignItems: "center", justifyContent: "center",
							padding: 0, cursor: "pointer", color: INK_SOFT,
						}}
						onClick={() => onReport(data.id)}
						aria-label="Report listing"
					>
						<Icon name="action.report" size={20} aria-hidden />
					</button>
				) : null}
			</div>

			{/* ── INFO ROWS ── */}
			<div style={{
				display: "flex", flexDirection: "column",
				gap: "var(--dc-gap, 8px)", padding: "var(--dc-padding, 12px)",
			}}>

				{/* 2. HOST NAME */}
				{titleHandler ? (
					<button type="button" style={{ ...ROW_CELL_CAT, width: "100%", cursor: "pointer" }} onClick={titleHandler}>
						<span style={hostNameText}>{data.hostName}</span>
					</button>
				) : (
					<div style={ROW_CELL_CAT}>
						<span style={hostNameText}>{data.hostName}</span>
					</div>
				)}

				{/* 3. JOB TITLE */}
				{onOpen ? (
					<button type="button" style={{ ...ROW_CELL_CAT, width: "100%", cursor: "pointer" }} onClick={() => onOpen(data.id)}>
						<Icon name={CAT_ICON[cat]} size={20} aria-hidden />
						<span style={jobTitleText}>{roleText}</span>
					</button>
				) : (
					<div style={ROW_CELL_CAT}>
						<Icon name={CAT_ICON[cat]} size={20} aria-hidden />
						<span style={jobTitleText}>{roleText}</span>
					</div>
				)}

				{/* 4. LOCATION — only when a real place is known */}
				{hasLocation ? (
					onLocationClick ? (
						<button type="button" style={{ ...ROW_CELL_CAT, width: "100%", cursor: "pointer" }} onClick={() => onLocationClick(data.id)}>
							<Icon name={MAPPIN[cat]} size={20} aria-hidden />
							<span style={locationText}>{data.location}</span>
						</button>
					) : (
						<div style={ROW_CELL_CAT}>
							<Icon name={MAPPIN[cat]} size={20} aria-hidden />
							<span style={locationText}>{data.location}</span>
						</div>
					)
				) : null}

				{/* 5. TIMING — concrete BEGINS | ENDS when known, else the opportunity window */}
				{hasDates ? (
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--dc-gap, 8px)" }}>
						<div style={STRIP_CELL_CAT}>
							<span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
								<Icon name="status.begins" size={16} aria-hidden />
								<span style={stripLabel}>Begins</span>
							</span>
							<span style={stripValue}>{data.begins ?? "Flexible"}</span>
						</div>
						<div style={STRIP_CELL_CAT}>
							<span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
								<Icon name="status.ends" size={16} aria-hidden />
								<span style={stripLabel}>Ends</span>
							</span>
							<span style={stripValue}>{data.ends ?? "Flexible"}</span>
						</div>
					</div>
				) : (
					<div style={{ ...STRIP_CELL_CAT, flexDirection: "row", gap: "7px", padding: "9px 14px" }}>
						<Icon name="status.begins" size={16} aria-hidden />
						<span style={locationText}>{data.opportunityWindow || "Open timing"}</span>
					</div>
				)}

				{/* 6. SKILLS (applicant review) or HOUSING | MEALS | PAY */}
				{isApplicantReview && data.skills && data.skills.length > 0 ? (
					/* Top skills in place of H/M/P on applicant card */
					<div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
						{data.skills.slice(0, 3).map((skill) => (
							<span key={skill} style={{
								fontFamily: UI_FONT, fontSize: "10px", fontWeight: 700,
								letterSpacing: "0.05em", textTransform: "uppercase",
								color: INK, background: PAPER,
								border: `1.5px solid ${INK}`,
								borderRadius: "6px", padding: "3px 8px",
								lineHeight: 1.2,
							}}>
								{skill}
							</span>
						))}
					</div>
				) : (
					/* Standard H/M/P row — icon+label for housing/meals, icon+rate for pay */
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--dc-gap, 8px)" }}>
						{canOpenHousing ? (
							<button type="button" className="dc-benefit-btn" style={housingCell} onClick={() => onHousingClick!(data.id)} aria-label={`Housing: ${data.triad.housing}`}>
								<Icon name="benefit.housing" size={16} aria-hidden />
								<span style={stripLabel}>{data.housingOccupancy === "solo" ? "Private" : data.housingOccupancy === "shared" ? "Shared" : "Housing"}</span>
							</button>
						) : (
							<div style={housingCell} aria-label={`Housing: ${data.triad.housing}`}>
								<Icon name="benefit.housing" size={16} aria-hidden />
								<span style={stripLabel}>{data.housingOccupancy === "solo" ? "Private" : data.housingOccupancy === "shared" ? "Shared" : "Housing"}</span>
							</div>
						)}

						{canOpenMeals ? (
							<button type="button" className="dc-benefit-btn" style={mealsCell} onClick={() => onMealsClick!(data.id)} aria-label={`Meals: ${data.triad.meals}`}>
								<Icon name="benefit.meals" size={16} aria-hidden />
								<span style={stripLabel}>Meals</span>
							</button>
						) : (
							<div style={mealsCell} aria-label={`Meals: ${data.triad.meals}`}>
								<Icon name="benefit.meals" size={16} aria-hidden />
								<span style={stripLabel}>Meals</span>
							</div>
						)}

						{onPayClick ? (
							<button type="button" className="dc-benefit-btn" style={payCell} onClick={() => onPayClick(data.id)} aria-label={`Pay: ${data.triad.pay}`}>
								<Icon name="benefit.pay" size={16} aria-hidden />
								<span style={stripValue}>{data.triad.pay}</span>
							</button>
						) : (
							<div style={payCell} aria-label={`Pay: ${data.triad.pay}`}>
								<Icon name="benefit.pay" size={16} aria-hidden />
								<span style={stripValue}>{data.triad.pay}</span>
							</div>
						)}
					</div>
				)}

				{/* Match meter (matched surface only) */}
				{surface === "matched" && typeof data.matchScore === "number" ? (
					<div>
						<Meter value={data.matchScore} label="Match" />
					</div>
				) : null}

				{/* 7. CTA — admin_review: Approve/Warn/Remove strip; host_applicant_review: Skip/Save/Schedule strip; all other surfaces: single stamp button */}
				{actions ?? (
					isAdminReview ? (
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--dc-gap, 8px)" }}>
							<button
								type="button"
								onClick={onApprove ? () => onApprove(data.id) : undefined}
								style={{
									background: "var(--status-success-fg)", color: "var(--palette-paper)",
									border: "3px solid var(--status-success-fg)", borderRadius: "10px",
									fontFamily: DISPLAY_FONT, fontSize: "clamp(11px, 2.8vw, 14px)",
									fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
									padding: "12px 6px",
									display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
									cursor: onApprove ? "pointer" : "default",
									boxShadow: "3px 3px 0 rgba(23,19,13,0.30)",
								}}
							>
								<Icon name="system.success" size={16} aria-hidden />
								Approve
							</button>
							<button
								type="button"
								onClick={onWarn ? () => onWarn(data.id) : undefined}
								style={{
									background: "transparent", color: "var(--status-warning-fg)",
									border: "2px dashed var(--status-warning-fg)", borderRadius: "10px",
									fontFamily: DISPLAY_FONT, fontSize: "clamp(11px, 2.8vw, 14px)",
									fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
									padding: "12px 6px",
									display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
									cursor: onWarn ? "pointer" : "default",
								}}
							>
								<Icon name="system.info" size={16} aria-hidden />
								Warn
							</button>
							<button
								type="button"
								onClick={onRemove ? () => onRemove(data.id) : undefined}
								style={{
									background: "transparent", color: "var(--status-error-fg)",
									border: "2px dashed var(--status-error-fg)", borderRadius: "10px",
									fontFamily: DISPLAY_FONT, fontSize: "clamp(11px, 2.8vw, 14px)",
									fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
									padding: "12px 6px",
									display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
									cursor: onRemove ? "pointer" : "default",
								}}
							>
								<Icon name="action.close" size={16} aria-hidden />
								Remove
							</button>
						</div>
					) : isApplicantReview ? (
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--dc-gap, 8px)" }}>
							{/* SKIP — active dark stamp */}
							<button
								type="button"
								onClick={onSkip ? () => onSkip(data.id) : undefined}
								style={{
									background: INK, color: PAPER,
									border: `3px solid ${INK}`, borderRadius: "10px",
									fontFamily: DISPLAY_FONT, fontSize: "clamp(11px, 2.8vw, 14px)",
									fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
									padding: "12px 6px",
									display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
									cursor: onSkip ? "pointer" : "default",
									boxShadow: "3px 3px 0 rgba(23,19,13,0.30)",
								}}
							>
								<span aria-hidden style={{ fontFamily: UI_FONT, fontSize: "12px", opacity: 0.6 }}>≥—</span>
								Skip
								<span aria-hidden style={{ fontFamily: UI_FONT, fontSize: "12px", opacity: 0.6 }}>—≤</span>
							</button>

							{/* SAVE — neutral bordered */}
							<button
								type="button"
								onClick={onSave ? () => onSave!(data.id) : undefined}
								style={{
									background: "transparent", color: INK,
									border: `2px dashed ${INK_SOFT}`, borderRadius: "10px",
									fontFamily: DISPLAY_FONT, fontSize: "clamp(11px, 2.8vw, 14px)",
									fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
									padding: "12px 6px",
									display: "flex", alignItems: "center", justifyContent: "center",
									cursor: onSave ? "pointer" : "default",
								}}
							>
								Save
							</button>

							{/* SCHEDULE — blue bordered */}
							<button
								type="button"
								onClick={onSchedule ? () => onSchedule!(data.id) : onOpen ? () => onOpen(data.id) : undefined}
								style={{
									background: "transparent", color: P_INK,
									border: `2px dashed ${P_INK}`, borderRadius: "10px",
									fontFamily: DISPLAY_FONT, fontSize: "clamp(11px, 2.8vw, 14px)",
									fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
									padding: "12px 6px",
									display: "flex", alignItems: "center", justifyContent: "center",
									cursor: "pointer",
								}}
							>
								Schedule
							</button>
						</div>
					) : (
						<button
							type="button"
							disabled={ctaDisabled}
							onClick={ctaHandler}
							style={{
								width: "100%",
								background: ctaBg,
								color: ctaColor,
								border: ctaBorderVal,
								borderRadius: "10px",
								fontFamily: DISPLAY_FONT,
								fontSize: "clamp(14px, 3.5vw, 17px)",
								fontWeight: 900,
								letterSpacing: "0.10em",
								textTransform: "uppercase",
								padding: "11px 16px",
								display: "flex", alignItems: "center",
								justifyContent: "center", gap: "14px",
								cursor: ctaDisabled ? "not-allowed" : "pointer",
								opacity: ctaDisabled ? 0.60 : 1,
								boxShadow: ctaShadow,
							}}
						>
							{!isPassiveCta && <Icon name="action.apply" size={16} aria-hidden />}
							{ctaLabel}
							{!isPassiveCta && <Icon name="action.forward" size={16} aria-hidden />}
						</button>
					)
				)}
			</div>
		</article>
		</>
	)
}
