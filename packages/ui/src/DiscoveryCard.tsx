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

const INK       = "#1A2B3C"
const INK_SOFT  = "rgba(26,43,60,0.46)"
const PAPER     = "#FEFAF4"

const H_INK = "#185848"   /* green  — housing/meals available */
const P_INK = "#184878"   /* blue   — pay */

/** Per-category card body — top-lit, atmospheric, inviting */
const CAT_CARD: Record<MarketplaceCategory, string> = {
	farm:
		"radial-gradient(ellipse 180% 60% at 50% -5%, rgba(255,240,180,0.62) 0%, transparent 52%)," +
		"radial-gradient(ellipse 90% 70% at 20% 95%, rgba(201,139,27,0.22) 0%, transparent 65%)," +
		"linear-gradient(158deg, #FAF0CC 0%, #EED990 55%, #D4B84A 100%)",
	maritime:
		"radial-gradient(ellipse 180% 60% at 50% -5%, rgba(200,235,255,0.58) 0%, transparent 52%)," +
		"radial-gradient(ellipse 90% 70% at 80% 95%, rgba(26,78,114,0.20) 0%, transparent 65%)," +
		"linear-gradient(158deg, #EAF4FF 0%, #B8D8F4 55%, #88B8E0 100%)",
	remote:
		"radial-gradient(ellipse 180% 60% at 50% -5%, rgba(210,200,255,0.52) 0%, transparent 52%)," +
		"radial-gradient(ellipse 90% 70% at 20% 95%, rgba(48,56,152,0.18) 0%, transparent 65%)," +
		"linear-gradient(158deg, #F0EAFF 0%, #C8B8F4 55%, #A090D8 100%)",
	seasonal:
		"radial-gradient(ellipse 180% 60% at 50% -5%, rgba(190,248,210,0.55) 0%, transparent 52%)," +
		"radial-gradient(ellipse 90% 70% at 20% 95%, rgba(26,94,56,0.18) 0%, transparent 65%)," +
		"linear-gradient(158deg, #EAFAE0 0%, #B8DCA0 55%, #84BC68 100%)",
	mix:
		"radial-gradient(ellipse 180% 60% at 50% -5%, rgba(248,244,238,0.58) 0%, transparent 52%)," +
		"radial-gradient(ellipse 90% 70% at 20% 95%, rgba(42,62,106,0.14) 0%, transparent 65%)," +
		"linear-gradient(158deg, #F5ECD8 0%, #D8C4A4 55%, #BCA880 100%)",
}

/** Per-category hero fallback (no cover image) */
const CAT_HERO: Record<MarketplaceCategory, string> = {
	farm:     "linear-gradient(145deg, #C4A854 0%, #E8CC80 50%, #F4DFA0 100%)",
	maritime: "linear-gradient(145deg, #5C9CC8 0%, #8EC4E4 50%, #B4D8F0 100%)",
	remote:   "linear-gradient(145deg, #7870B8 0%, #A898D8 50%, #C8C0EC 100%)",
	seasonal: "linear-gradient(145deg, #5A9C60 0%, #8CC480 50%, #B0D898 100%)",
	mix:      "linear-gradient(145deg, #A890A0 0%, #C8B0B8 50%, #DED0C8 100%)",
}

/** Per-category top accent border — aligned with V2 category fg tokens */
const CAT_ACCENT: Record<MarketplaceCategory, string> = {
	farm:     "#C98B1B",    /* warm gold — farm is intentionally warm */
	maritime: "#1A4E72",    /* V2 maritime fg */
	remote:   "#303898",    /* V2 remote fg */
	seasonal: "#1A5E38",    /* V2 seasonal fg */
	mix:      "#2A3E6A",    /* V2 mix fg — cool navy, not warm purple */
}

/** Per-category ambient glow (inset bottom) — makes each card feel lit from within */
const CAT_GLOW: Record<MarketplaceCategory, string> = {
	farm:     "rgba(201,139,27,0.18)",
	maritime: "rgba(26,78,114,0.16)",
	remote:   "rgba(48,56,152,0.15)",
	seasonal: "rgba(26,94,56,0.16)",
	mix:      "rgba(42,62,106,0.13)",
}

/** Per-category info-cell bg — tinted gradient pulls each cell into the card's color identity */
const CAT_CELL_BG: Record<MarketplaceCategory, string> = {
	farm:     "linear-gradient(180deg, rgba(250,240,200,0.64) 0%, rgba(238,215,130,0.48) 100%)",
	maritime: "linear-gradient(180deg, rgba(234,244,255,0.68) 0%, rgba(180,210,244,0.52) 100%)",
	remote:   "linear-gradient(180deg, rgba(240,234,255,0.66) 0%, rgba(196,180,244,0.50) 100%)",
	seasonal: "linear-gradient(180deg, rgba(234,250,224,0.66) 0%, rgba(180,220,152,0.50) 100%)",
	mix:      "linear-gradient(180deg, rgba(245,236,215,0.64) 0%, rgba(214,193,155,0.48) 100%)",
}

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

const RED_INK = "rgba(180,44,28,0.72)"

// Housing / Meals
const HM_GREEN_BG     = "linear-gradient(180deg, rgba(228,248,240,0.97) 0%, rgba(196,232,220,0.94) 100%)"
const HM_GREEN_BORDER = `2px solid ${H_INK}`
const HM_GREEN_SHADOW = `inset 0 1.5px 0 rgba(255,255,255,0.82), 0 3px 8px rgba(24,88,72,0.22), 0 1px 3px rgba(24,88,72,0.14)`
const HM_RED_BG       = "linear-gradient(180deg, rgba(255,240,238,0.97) 0%, rgba(252,222,218,0.93) 100%)"
const HM_RED_BORDER   = `1.5px solid rgba(180,44,28,0.28)`
const HM_RED_SHADOW   = "inset 0 1.5px 3px rgba(180,44,28,0.07), inset 0 1px 0 rgba(255,255,255,0.55)"

// partial is treated identically to provided — "available" is the single signal
function hmBg(p: BenefitProvision | undefined):     string { return (p === "provided" || p === "partial") ? HM_GREEN_BG     : HM_RED_BG     }
function hmBorder(p: BenefitProvision | undefined): string { return (p === "provided" || p === "partial") ? HM_GREEN_BORDER : HM_RED_BORDER }
function hmColor(p: BenefitProvision | undefined):  string { return (p === "provided" || p === "partial") ? H_INK           : RED_INK       }
function hmShadow(p: BenefitProvision | undefined): string { return (p === "provided" || p === "partial") ? HM_GREEN_SHADOW : HM_RED_SHADOW }

// Pay — always blue regardless of provision
const PAY_BG     = "linear-gradient(180deg, rgba(222,240,252,0.97) 0%, rgba(192,220,244,0.94) 100%)"
const PAY_BORDER = `2px solid ${P_INK}`
const PAY_COLOR  = P_INK
const PAY_SHADOW = `inset 0 1.5px 0 rgba(255,255,255,0.82), 0 3px 8px rgba(24,72,120,0.22), 0 1px 3px rgba(24,72,120,0.14)`

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
	background: "rgba(255,248,225,0.96)",
	backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
	boxShadow: "0 2px 10px rgba(23,19,13,0.24), 0 1px 0 rgba(255,255,255,0.90) inset",
	whiteSpace: "nowrap",
}

/** Info row cell (name / job / location) — debossed tray feel */
const ROW_CELL: CSSProperties = {
	display: "flex", alignItems: "center", justifyContent: "center",
	gap: "6px", padding: "9px 14px",
	background: PAPER, border: "1.5px solid rgba(26,43,60,0.16)",
	borderRadius: "10px", textAlign: "center",
	boxShadow: "inset 0 2px 4px rgba(26,43,60,0.08), inset 0 1px 0 rgba(0,0,0,0.04), 0 1.5px 0 rgba(255,255,255,0.72)",
}

/** Strip cell — stacked (begins/ends columns) — debossed tray feel */
const STRIP_CELL: CSSProperties = {
	display: "flex", flexDirection: "column",
	alignItems: "center", justifyContent: "center",
	gap: "3px", padding: "8px 6px",
	background: PAPER, border: "1.5px solid rgba(26,43,60,0.16)",
	borderRadius: "10px", textAlign: "center",
	boxShadow: "inset 0 2px 4px rgba(26,43,60,0.08), inset 0 1px 0 rgba(0,0,0,0.04), 0 1.5px 0 rgba(255,255,255,0.72)",
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
	const cellBg          = CAT_CELL_BG[cat]
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
		: isFilled    ? { label: "Filled",   color: "#fff", bg: "linear-gradient(135deg, #1D5026 0%, #2F6B3F 100%)", decoration: false }
		: isReported  ? { label: data.reportCount ? `${data.reportCount} Reports` : "Reported", color: "#fff", bg: "linear-gradient(135deg, #C93824 0%, #E84020 100%)", decoration: false }
		: isBoosted   ? { label: "Boosted",  color: "#fff", bg: "linear-gradient(135deg, #B8780A 0%, #D4960C 50%, #E8A820 100%)", icon: "status.boosted" as IconKey, decoration: false }
		: null

	// R1 right secondary: passive state badges only (boosted moved to center)
	// When boosted+matched conflict: boosted takes center, match score surfaces here as "92% Match"
	type SecondaryBadge = { label: string; ink: string }
	const matchBadgeLabel = typeof data.matchScore === "number" ? `${data.matchScore}% Match` : "Matched"
	const secondaryBadge: SecondaryBadge | null =
		isSaved       ? { label: "Saved",          ink: "#1D5026" }
		: isOffered   ? { label: "Offered",         ink: "#1D5026" }
		: isAccepted  ? { label: "Accepted",        ink: "#1D5026" }
		: isMatched   ? { label: matchBadgeLabel,   ink: "#0D3E6A" }
		: isInvited   ? { label: "Invited",         ink: "#7A5A10" }
		: isNotSelected ? { label: "Passed",        ink: INK_SOFT  }
		: isWithdrawn ? { label: "Withdrawn",       ink: INK_SOFT  }
		: isPaused    ? { label: "Paused",          ink: "#7A5A10" }
		: isExpired   ? { label: "Expired",         ink: INK_SOFT  }
		: isReported && data.reportCategory ? { label: data.reportCategory, ink: "#8B1A1A" }
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
		background: CAT_CARD[cat],
		border: `2px solid ${INK}`,
		borderTop: `5px solid ${CAT_ACCENT[cat]}`,
		borderRadius: "24px",
		color: INK,
		opacity: isDisabled ? 0.6 : 1,
		boxShadow: [
			"inset 0 0 0 1.5px rgba(255,253,246,0.80)",   /* inner rim highlight */
			"inset 0 5px 0 rgba(255,255,255,0.46)",        /* top surface catch-light */
			`inset 0 -52px 68px ${CAT_GLOW[cat]}`,         /* category ambient from below */
			"inset 0 0 120px rgba(26,43,60,0.03)",          /* subtle depth vignette */
			"5px 8px 0 rgba(26,43,60,0.26)",               /* hard offset shadow */
			"0 1px 0 rgba(26,43,60,0.48)",                 /* ground contact shadow */
			"0 20px 52px rgba(26,43,60,0.18)",             /* soft lift shadow */
		].join(", "),
	}

	const heroStyle: CSSProperties = {
		position: "relative", width: "100%", aspectRatio: "4 / 3",
		overflow: "hidden", flexShrink: 0,
		background: CAT_HERO[cat],
		borderBottom: `2px solid ${INK}`,
	}

	const hostCircle: CSSProperties = {
		width: "var(--dc-host-size, 74px)", height: "var(--dc-host-size, 74px)",
		borderRadius: "50%",
		border: "3px solid rgba(255,248,225,0.95)",
		// dark ring + category-colored glow ring + deep shadow
		boxShadow: `0 0 0 2.5px ${INK}, 0 0 0 5px ${CAT_ACCENT[cat]}, 0 6px 20px rgba(26,43,60,0.40)`,
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
			className="ui-card--discovery"
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
				) : null}

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
								background: "#155DA8",
								border: "2px solid rgba(255,248,225,0.95)",
								boxShadow: `0 0 0 1px ${INK}, 0 2px 6px rgba(0,0,0,0.32)`,
								display: "flex", alignItems: "center", justifyContent: "center",
								color: "#fff", flexShrink: 0,
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
							background: "linear-gradient(90deg, #C93824 0%, #E87520 28%, #E8C020 55%, #5AA830 100%)",
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
							background: "linear-gradient(90deg, #C93824 0%, #E87520 28%, #E8C020 55%, #5AA830 100%)",
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
						background: CAT_ACCENT[cat],
						color: "#FFFAF0",
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
							border: `1px solid ${secondaryBadge.ink === INK_SOFT ? "rgba(23,19,13,0.18)" : secondaryBadge.ink + "50"}`,
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

				{/* 4. LOCATION */}
				{onLocationClick ? (
					<button type="button" style={{ ...ROW_CELL_CAT, width: "100%", cursor: "pointer" }} onClick={() => onLocationClick(data.id)}>
						<Icon name={MAPPIN[cat]} size={20} aria-hidden />
						<span style={locationText}>{data.location}</span>
					</button>
				) : (
					<div style={ROW_CELL_CAT}>
						<Icon name={MAPPIN[cat]} size={20} aria-hidden />
						<span style={locationText}>{data.location}</span>
					</div>
				)}

				{/* 5. BEGINS | ENDS — own 2-column row, never collapses */}
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--dc-gap, 8px)" }}>
					<div style={STRIP_CELL_CAT}>
						<span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
							<Icon name="status.begins" size={16} aria-hidden />
							<span style={stripLabel}>Begins</span>
						</span>
						<span style={stripValue}>{data.begins ?? "—"}</span>
					</div>
					<div style={STRIP_CELL_CAT}>
						<span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
							<Icon name="status.ends" size={16} aria-hidden />
							<span style={stripLabel}>Ends</span>
						</span>
						<span style={stripValue}>{data.ends ?? "—"}</span>
					</div>
				</div>

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
									background: "#1D5026", color: "#fff",
									border: "3px solid #1D5026", borderRadius: "10px",
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
									background: "transparent", color: "#7A5A10",
									border: "2px dashed #B8780A", borderRadius: "10px",
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
									background: "transparent", color: "#C93824",
									border: "2px dashed #C93824", borderRadius: "10px",
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
