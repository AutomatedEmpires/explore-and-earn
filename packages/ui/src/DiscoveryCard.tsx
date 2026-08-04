import type { CSSProperties, ReactNode } from "react"

import {
	NOT_STATED_LABEL,
	SOURCED_DISCLOSURE_LABEL,
	benefitCardState,
	cardRecordCompleteness,
	missingFactsSentence,
	type BenefitCardState,
	type BenefitEvidenceStatus,
	type BenefitProvision,
	type DiscoveryCardConditionalBadge,
	type DiscoveryCardSurface,
	type ListingProvenance,
	type MarketplaceCategory,
	type OpportunityTriad,
} from "@explore-and-earn/contracts"

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
 *
 * All styling lives in DiscoveryCard.module.css (token classes). The only
 * dynamic style is the --dc-bar-pct custom property feeding the hero bar.
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
	/**
	 * Listing provenance (contracts/provenance.ts). Absent/"verified" = a
	 * host-confirmed listing (all existing behavior). "sourced" = a real,
	 * attributable public posting Explore & Earn has NOT confirmed: the card
	 * renders the sourced disclosure, labels the badge "SOURCE" not a verified
	 * host, and shows benefits by their evidence (not_stated ≠ not provided).
	 */
	readonly provenance?: ListingProvenance
	/** Per-benefit evidence; drives not_stated vs not-provided rendering. */
	readonly benefitEvidence?: {
		readonly housing: BenefitEvidenceStatus
		readonly meals: BenefitEvidenceStatus
		readonly pay: BenefitEvidenceStatus
	}
	readonly fillPercent?: number

	// ── Card v2 (V2-G) ────────────────────────────────────────────────────────
	//
	// Every field below is OPTIONAL and self-omitting, and the card renders each
	// one ONLY when it is present. That is the whole design: a listing whose host
	// never answered a question shows the question as unanswered (see the
	// "what's missing" line below), never a plausible default. Display strings
	// arrive pre-formatted from the host app so this package stays locale-free.

	/** Derived from begins/ends by formatSeasonLength, e.g. "about 12 weeks". */
	readonly seasonLength?: string
	/**
	 * Pre-formatted `listings.expires_at`. Rendered as "Listing closes …" and
	 * NEVER as an application deadline: the schema stores no deadline, and
	 * promoting an expiry into one would invent a commitment.
	 */
	readonly closesOn?: string
	/** Host-stated `experience_level_required`. */
	readonly experienceLevel?: string
	/** Host-stated `physical_demand`, 0–3. Absent = unstated (never 0). */
	readonly physicalDemand?: number
	/** Host-stated listing perks (060). Up to three are shown. */
	readonly perks?: readonly string[]
	/** Host's free-text housing summary (`housing_description`). */
	readonly housingSummary?: string
	/** Host's free-text meals summary (`meals_description`). */
	readonly mealsSummary?: string
	/**
	 * Render-time match reasons, computed from the stored component scores. Shown
	 * only beside a shown match score — an explanation of a hidden number is an
	 * explanation of nothing.
	 */
	readonly matchReasons?: readonly { readonly label: string }[]
	/** ADR-040 confidence (data quality), distinct from the score. */
	readonly matchConfidence?: number
	/** Employer logo/mark for the info-zone chip (`host_profiles.photo_url`). */
	readonly employerLogoUrl?: string

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
	/**
	 * Opens the dates popover (season window, length, listing close). Supplying
	 * it turns the BEGINS|ENDS strip into a real button; omitting it leaves the
	 * strip as static text. There is no hover-only path either way.
	 */
	readonly onDatesClick?: (id: string) => void
	/** Opens the verification popover — what the Verified Host badge does and does not assert. */
	readonly onVerificationClick?: (id: string) => void
	/** Opens the match-detail popover (which axes carried the score, and confidence). */
	readonly onMatchClick?: (id: string) => void
	/** Share this listing. Rendered in the image zone beside Report. */
	readonly onShare?: (id: string) => void
	readonly onSkip?: (id: string) => void
	readonly onSchedule?: (id: string) => void
	readonly onApprove?: (id: string) => void
	readonly onHold?: (id: string) => void
	readonly onReject?: (id: string) => void
	readonly adminActionsDisabled?: boolean
	readonly actions?: ReactNode
	/**
	 * Seeker previously skipped this listing. Skipped listings are demoted-but-
	 * visible everywhere except the swipe deck (founder decision) — when true the
	 * card renders a subtle bottom-left "Previously skipped" photo marker.
	 */
	readonly previouslySkipped?: boolean
	/**
	 * Above-the-fold cards should pass "eager": the cover then loads with
	 * fetchpriority=high (LCP + deterministic screenshots). Default "lazy" —
	 * feeds keep below-fold covers off the critical path.
	 */
	readonly imageLoading?: "eager" | "lazy"
	/**
	 * Optional cover-image renderer — lets the host app substitute a framework
	 * image component (e.g. next/image for srcset/responsive resizing) without
	 * packages/ui taking a framework dependency. The renderer receives the
	 * cover box's contract and MUST apply `className` (absolute-inset,
	 * object-fit cover — the .hero parent is a fixed 16/10 aspect box, so
	 * sizing never shifts layout) and honor `loading`/`fetchPriority`.
	 * Default: the plain `<img>` below.
	 */
	readonly renderCoverImage?: (cover: {
		readonly src: string
		readonly alt: string
		readonly className: string
		readonly loading: "eager" | "lazy"
		readonly fetchPriority?: "high"
	}) => ReactNode
	/**
	 * Lifecycle / relationship state. `interview`, `skipped` and `closed` joined
	 * the set in V2-G: an interview is not the same promise as a scheduling
	 * request, a skipped listing on a review surface needs its own honest badge,
	 * and a host-closed role is not the same fact as an expired one.
	 */
	readonly cardState?:
		| "saved" | "applied" | "offered" | "scheduled" | "interview"
		| "accepted" | "matched" | "not_selected" | "withdrawn"
		| "draft" | "paused" | "expired" | "filled" | "closed"
		| "invited" | "reported" | "unavailable" | "skipped"
}

// ─── Category maps ────────────────────────────────────────────────────────────

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

// Housing/Meals/Pay cell styling lives in DiscoveryCard.module.css
// (.triad / .benefit* classes) — glance-readable green ✓ / red ✕ / gold, so
// the triad reads as the card's dominant module. See BenefitTriadCell below.

// ─── Fill bar helpers ─────────────────────────────────────────────────────────

function fillCopy(pct: number): string {
	if (pct >= 90) return "Almost full"
	if (pct >= 70) return "Filling fast"
	if (pct >= 45) return "Filling up"
	return "Open spots"
}

function clampPct(pct: number): number {
	return Math.min(100, Math.max(0, pct))
}

/**
 * Match score is shown as the centered pill on ANY surface whenever the stored
 * `data.matchScore` reaches this threshold (founder decision 2026-07-14 — a
 * strong match is a product selling point, not a per-surface allowlist). Stored
 * scores are read as-is; the card never recomputes. Listings below this simply
 * show no match pill.
 */
export const MATCH_SHOW_THRESHOLD = 75

/** Match-quality band → class. Colour-codes "how well" (founder direction). */
function matchBandClass(pct: number): string {
	return pct >= 85 ? styles.matchStrong
		: pct >= 70 ? styles.matchGood
			: pct >= 55 ? styles.matchFair
				: styles.matchLow
}

// ─── Badge tone → class maps (badge LOGIC below is locked; only styling maps) ─

type CenterTone = "paper" | "success" | "error" | "boosted"

const CENTER_TONE_CLASS: Record<CenterTone, string> = {
	paper: "",
	success: styles.stampSuccess,
	error: styles.stampError,
	boosted: styles.stampBoosted,
}

type SecondaryTone = "success" | "match" | "warning" | "muted" | "error"

const SECONDARY_TONE_CLASS: Record<SecondaryTone, string> = {
	success: styles.toneSuccess,
	match: styles.toneMatch,
	warning: styles.toneWarning,
	muted: styles.toneMuted,
	error: styles.toneError,
}

// The card's benefit state is decided by benefitCardState() in contracts —
// pure, tested, and shared, because the private version of this inference is
// what let the card announce "Housing: included" for a listing nobody had
// answered.
/**
 * Resolve one seeker-facing benefit value without turning silence into a
 * promise. Evidence/provision wins over stale summary text; once the benefit is
 * known to be answered, prefer the host's concise summary and then the triad
 * fallback already carried by the canonical card contract.
 */
function benefitTruthValue(
	provision: BenefitProvision | undefined,
	evidence: BenefitEvidenceStatus | undefined,
	summary: string | undefined,
	fallback: string,
): string {
	const state = benefitCardState(provision, evidence)
	if (state === "not_stated") {
		return NOT_STATED_LABEL
	}
	// An explicit NO is authoritative. Old summary copy can survive a host
	// changing the provision, so it must never override the current decision.
	if (state === "not_provided") {
		return "Not provided"
	}
	const statedSummary = summary?.trim()
	// `benefitCardState` intentionally folds partial into its positive state for
	// card color semantics. Preserve the finer provision truth in visible copy,
	// including when the host also supplied a useful summary.
	if (provision === "partial") {
		return statedSummary ? `Partial — ${statedSummary}` : "Partial"
	}
	if (statedSummary) {
		return statedSummary
	}
	return fallback.trim() || "Provided"
}

// ─── Benefit triad cell (housing / meals / pay) ────────────────────────────
//
// The card's dominant module. Housing & Meals read OFFERED (green ✓) / NOT
// OFFERED (red ✕) / NOT STATED (neutral) via icon AND colour; Pay is always
// gold and carries the rate.
// A clickable cell (photo bucket / pay scale) renders as a <button>.
function BenefitTriadCell({
	kind,
	state,
	value,
	onClick,
}: {
	readonly kind: "housing" | "meals" | "pay"
	/**
	 * Canonical benefit truth. Keeping the complete state together prevents
	 * stale display copy from overriding an explicit no or unanswered value.
	 */
	readonly state: BenefitCardState
	readonly value: string
	readonly onClick?: () => void
}) {
	const isPay = kind === "pay"
	const stateClass = state === "not_stated"
			? styles.benefitNotStated
			: state === "not_provided"
				? styles.benefitNot
				: isPay
					? styles.benefitPay
					: styles.benefitProvided
	const label = kind === "housing" ? "Housing" : kind === "meals" ? "Meals" : "Pay"
	// Housing/Meals carry NO icon and NO checkmark on the card (founder card-v2.2
	// lock) — just the label on a COLOR-CODED cell; the detail lives in the popup.
	// Pay shows the rate. aria states the state.
	//
	// UX review 2026-07-23 — COLOUR IS NO LONGER THE SOLE CARRIER. Previously
	// "included" and "not included" rendered the SAME text ("Housing"), with no
	// icon and no marker, distinguished ONLY by the success-green vs error-red
	// label token (measured live in the dev catalog). Red/green is precisely the
	// pair ~8% of men cannot separate, and this is the product's core promise —
	// a seeker who cannot read the colour cannot learn whether housing is
	// included at all.
	// Founder law: "Information must never be communicated only through color."
	// The fix keeps the v2.2 lock intact (no icon, no checkmark, one compact
	// tier) and instead lets the LABEL carry the state, exactly as the
	// "Not stated" cell already does in this same component.
	const stateText = state === "not_stated"
		? "not stated"
		: state === "not_provided"
			? isPay ? "not provided" : "not included"
			: isPay ? "" : "included"
	const aria = `${label}${stateText ? `: ${stateText}` : value ? ` — ${value}` : ""}`
	const displayValue = state === "not_stated"
		? NOT_STATED_LABEL
		: state === "not_provided"
			? "Not provided"
			: value.trim() || "Provided"
	const benefitText = state === "not_stated"
		? NOT_STATED_LABEL
		: state === "provided"
			? label
			: kind === "housing"
				? "No housing"
				: "No meals"

	const inner = isPay ? (
		<>
			<span className={styles.benefitHead}>{label}</span>
			<span className={`${styles.benefitValue} ${styles.benefitPayValue}`}>{displayValue}</span>
		</>
	) : (
		<span className={styles.benefitLabel}>{benefitText}</span>
	)

	return onClick ? (
		<button type="button" className={`${styles.benefit} ${stateClass}`} onClick={onClick} aria-label={aria}>
			{inner}
		</button>
	) : (
		<div className={`${styles.benefit} ${stateClass}`} aria-label={aria}>
			{inner}
		</div>
	)
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
	onDatesClick,
	onVerificationClick,
	onMatchClick,
	onShare,
	onSkip,
	onSchedule,
	onApprove,
	onHold,
	onReject,
	adminActionsDisabled = false,
	actions,
	previouslySkipped,
	imageLoading = "lazy",
	renderCoverImage,
}: DiscoveryCardProps) {
	const cat      = data.category
	const roleText = data.positionTitle ?? data.title
	// Don't render placeholder content as if it were real — hide an empty/unknown
	// location, and collapse the begins|ends strip to the opportunity window when
	// no concrete dates exist (so the card never shows "LOCATION NOT SPECIFIED" or
	// a row of em-dashes).
	const hasLocation = Boolean(data.location) && data.location !== "Location not specified"
	const hasDates    = Boolean(data.begins || data.ends)
	// A sourced listing is real-but-unconfirmed inventory: NEVER verified, the
	// circle reads SOURCE (not a host), and the sourced disclosure always shows.
	const isSourced = data.provenance === "sourced"
	const verified = !isSourced && data.verifiedHost === true
	const ev = data.benefitEvidence
	const isDisabled            = variant === "disabled"
	const isApplicantReview     = surface === "host_applicant_review"
	const isAdminReview         = surface === "admin_review"
	const isDiscoveryFeed       = surface === "discovery_feed"
	const isSeekerSurface       = isApplicantReview  // alias kept for CTA compat
	const circleLabel           = isApplicantReview ? "SEEKER" : isSourced ? "SOURCE" : "HOST"

	const hp = data.benefitProvision?.housing
	const mp = data.benefitProvision?.meals
	const pp = data.benefitProvision?.pay
	const housingState = benefitCardState(hp, ev?.housing)
	const mealsState = benefitCardState(mp, ev?.meals)
	const payState = benefitCardState(pp, ev?.pay)

	// Every triad cell remains explainable, including an explicit "not provided"
	// or an unanswered value. The overlay owns the fuller truth and evidence
	// categories; disabling the tap on negative/empty states hid that context.
	const canOpenHousing = Boolean(onHousingClick)
	const canOpenMeals   = Boolean(onMealsClick)

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
	const isInterview   = cardState === "interview"
	const isSkipped     = cardState === "skipped"
	const isClosed      = cardState === "closed"
	// A listing the seeker kept (saved) that is no longer live — muted, honest,
	// non-actionable (pair with variant="disabled" for the dimmed treatment).
	const isUnavailable = cardState === "unavailable"

	// Founder badge rule (2026-07-13): a match score always claims the top-CENTER
	// slot on seeker browse/decision surfaces; a boosted listing then drops to
	// the right slot UNDER the category badge. Boosted only takes center when
	// there is no match score to show.
	type CenterBadge = { label: string; tone: CenterTone; icon?: IconKey; decoration: boolean }
	// Data-driven (not a surface allowlist): show the centered match pill wherever
	// the stored score is meaningful — saved/applied/offered/invites included.
	const matchCenterEligible =
		typeof data.matchScore === "number" && data.matchScore >= MATCH_SHOW_THRESHOLD

	const centerBadge: CenterBadge | null =
		isApplied    ? { label: "Applied",  tone: "paper",   decoration: false }
		: isInterview ? { label: "Interview", tone: "success", decoration: true }
		: isScheduled ? { label: "Schedule", tone: "paper",   decoration: true  }
		: isDraft     ? { label: "Draft",    tone: "paper",   decoration: false }
		: isFilled    ? { label: "Filled",   tone: "success", decoration: false }
		: isReported  ? { label: data.reportCount ? `${data.reportCount} Reports` : "Reported", tone: "error", decoration: false }
		: (isBoosted && !matchCenterEligible) ? { label: "Boosted", tone: "boosted", icon: "status.boosted" as IconKey, decoration: false }
		: null

	const showMatchCenter = !centerBadge && matchCenterEligible
	// Founder rule: a boosted listing ALWAYS carries its boosted marker somewhere.
	// It sits in the CENTER only when boosted is the sole signal (no match %, no
	// lifecycle/action badge) — i.e. when the resolved center badge IS the boosted
	// stamp. Whenever anything else occupies the center (a match % OR any lifecycle/
	// action stamp: Applied/Draft/Filled/Reported/Schedule), the boosted marker
	// drops to the right slot (gold, under the category badge). Never double-rendered.
	const boostedInCenter  = centerBadge?.tone === "boosted"
	const boostedSecondary = isBoosted && !boostedInCenter

	// R1 right secondary: passive state badges (match now shows centered).
	type SecondaryBadge = { label: string; tone: SecondaryTone }
	const secondaryBadge: SecondaryBadge | null =
		isSaved       ? { label: "Saved",          tone: "success" }
		: isOffered   ? { label: "Offered",         tone: "success" }
		: isAccepted  ? { label: "Accepted",        tone: "success" }
		: isInvited   ? { label: "Invited",         tone: "warning" }
		: isNotSelected ? { label: "Passed",        tone: "muted"   }
		: isWithdrawn ? { label: "Withdrawn",       tone: "muted"   }
		: isUnavailable ? { label: "No longer available", tone: "muted" }
		: isPaused    ? { label: "Paused",          tone: "warning" }
		: isExpired   ? { label: "Expired",         tone: "muted"   }
		// A host CLOSING a role and a listing EXPIRING are different facts about
		// different actors; collapsing them would tell the seeker the host acted
		// when nobody did.
		: isClosed    ? { label: "Closed",          tone: "muted"   }
		: isSkipped   ? { label: "Skipped",         tone: "muted"   }
		: isReported && data.reportCategory ? { label: data.reportCategory, tone: "error" }
		: null

	const showHeroBar  = !centerBadge && !showMatchCenter && typeof data.fillPercent === "number"

	// Seeker decision bar (Skip · Apply · Save) is the default CTA on browse
	// surfaces; resolved lifecycle states keep their single state CTA. Skip only
	// appears when a handler exists (e.g. a deck); the grid shows Apply · Save.
	const showDecisionBar =
		(isDiscoveryFeed || surface === "swipe" || surface === "map" || isMatched)
		&& !isApplied && !isReported && !isUnavailable && !isDisabled
		&& !isClosed && !isExpired && !isFilled
		// The three-label bar is atomic: rendering any dead control—or allowing
		// Apply to fall back to Quick Peek—would make its visible promise false.
		&& Boolean(onSkip && onApply && onSave)

	// ── CTA resolution ────────────────────────────────────────────────────────
	const ctaLabel =
		isApplied     ? "Applied"
		: isOffered   ? "Accept"
		: isInterview ? "View interview"
		: isClosed    ? "No longer accepting applications"
		: isSkipped   ? "Take another look"
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
		: isUnavailable ? "No longer available"
		: isSaved     ? "Quick Apply"
		: isSeekerSurface ? "View Seeker"
		: onApply     ? "Quick Apply"
		:               "Open Role"

	const ctaDisabled =
		isApplied || isNotSelected || isReported || isUnavailable || isDisabled || isClosed
	const ctaHandler  = ctaDisabled ? undefined
		: isSeekerSurface ? (onOpen ? () => onOpen(data.id) : undefined)
		: isInterview ? (onOpen  ? () => onOpen(data.id)  : undefined)
		: isSkipped   ? (onOpen  ? () => onOpen(data.id)  : undefined)
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

	const isPassiveCta =
		isApplied || isNotSelected || isReported || isUnavailable || isDisabled || isClosed
	const ctaClass = `${styles.cta}${isPassiveCta ? ` ${styles.ctaPassive}` : ""}`

	// ── Record completeness (V2-G honesty) ────────────────────────────────────
	//
	// Computed from EXACTLY the values rendered above, through the shared
	// contract, so the note can never contradict the card it sits under. A
	// listing that answers everything produces no note at all — the card does not
	// congratulate a host for doing the minimum.
	const record = cardRecordCompleteness({
		location: data.location,
		begins: data.begins,
		ends: data.ends,
		opportunityWindow: data.opportunityWindow,
		housingProvision: hp,
		mealsProvision: mp,
		payValue: data.triad.pay,
		benefitEvidence: ev,
	})
	const missingSentence = missingFactsSentence(record.missing)

	// The primary decision snapshot is always present on seeker listing cards.
	// Unanswered fields say so directly instead of disappearing and making the
	// card look complete. The stored match is never recomputed here.
	const matchValue =
		typeof data.matchScore === "number" && Number.isFinite(data.matchScore)
			? `${clampPct(data.matchScore)}%`
			: "Not scored"
	const glanceFacts = [
		{ key: "match", label: "Match", value: matchValue },
		{
			key: "season",
			label: "Season length",
			value: data.seasonLength?.trim() || NOT_STATED_LABEL,
		},
		{
			key: "housing",
			label: "Housing",
			value: benefitTruthValue(hp, ev?.housing, data.housingSummary, data.triad.housing),
		},
		{
			key: "meals",
			label: "Meals",
			value: benefitTruthValue(mp, ev?.meals, data.mealsSummary, data.triad.meals),
		},
	] as const

	// Additional stored facts stay self-omitting: unlike the core snapshot above,
	// these are not required to decide whether a seeker can take the role.
	const DEMAND_LABEL = ["Light", "Moderate", "Demanding", "Very demanding"] as const
	const facts: { key: string; label: string; value: string }[] = []
	if (data.experienceLevel) facts.push({ key: "experience", label: "Experience", value: data.experienceLevel })
	if (
		typeof data.physicalDemand === "number" &&
		Number.isInteger(data.physicalDemand) &&
		data.physicalDemand >= 0 &&
		data.physicalDemand < DEMAND_LABEL.length
	) {
		facts.push({ key: "demand", label: "Physical demand", value: DEMAND_LABEL[data.physicalDemand] })
	}
	const topPerks = (data.perks ?? []).slice(0, 3)
	const reasonLabels = (data.matchReasons ?? []).map((reason) => reason.label)
	// The reasons row explains a number the card is SHOWING. When the score is
	// below the display threshold there is no number on screen, so there is
	// nothing to explain and the row is not rendered.
	const showReasons = reasonLabels.length > 0 && matchCenterEligible
	const lowConfidence =
		typeof data.matchConfidence === "number" && data.matchConfidence < 55

	const hostCircleClass = [
		styles.hostCircle,
		onHostClick ? styles.hostCircleClickable : "",
		data.hostAvatarUrl ? styles.hostCircleHasAvatar : "",
	].filter(Boolean).join(" ")

	return (
		<article
			className={`ui-card--discovery ${styles.card}`}
			data-category={cat}
			data-surface={surface}
			data-variant={variant}
			data-state={cardState ?? "default"}
		>
			{/* ── 1. IMAGE / COVER AREA ── */}
			<div className={styles.hero}>
				{data.coverImageUrl ? (
					renderCoverImage ? (
						renderCoverImage({
							src: data.coverImageUrl,
							alt: `${data.hostName} cover`,
							className: styles.heroImg,
							loading: imageLoading,
							fetchPriority: imageLoading === "eager" ? "high" : undefined,
						})
					) : (
						<img
							src={data.coverImageUrl}
							alt={`${data.hostName} cover`}
							loading={imageLoading}
							fetchPriority={imageLoading === "eager" ? "high" : undefined}
							decoding="async"
							className={styles.heroImg}
						/>
					)
				) : (
					/* No cover yet — a large category watermark so the frame reads as
					   intentional, not empty (placeholder, not a filter on a photo). */
					<span aria-hidden className={styles.heroWatermark}>
						<Icon name={CAT_ICON[cat]} size={24} />
					</span>
				)}

				{/* Legibility scrim — the one sanctioned photo overlay */}
				<div className={styles.heroScrim} aria-hidden />

				{/* ── HOST BADGE (top-left) ── */}
				<div className={styles.hostSlot}>
					<button
						type="button"
						className={hostCircleClass}
						onClick={onHostClick ? () => onHostClick(data.id) : undefined}
						aria-label={verified ? `${data.hostName} — Verified Host` : data.hostName}
					>
						{data.hostAvatarUrl ? (
							<img
								src={data.hostAvatarUrl}
								alt={`${data.hostName} host avatar`}
								loading="lazy"
								decoding="async"
								className={styles.hostAvatarImg}
							/>
						) : (
							<span className={styles.hostCircleLabel}>
								{circleLabel}
							</span>
						)}
					</button>

					{/* Verified check — host listing surfaces only. NEVER on a seeker
					    applicant card, NEVER on a sourced listing (unconfirmed
					    inventory must not present as Explore & Earn-verified), and
					    ONLY when the host is actually verified.
					    UX review 2026-07-23: this gate previously read
					    `!isApplicantReview && !isSourced` — it never consulted
					    `verified` (computed at :324 and used only in the host
					    button's aria-label). Result: the green check rendered on
					    EVERY host-owned listing on 9 of 10 surfaces, so a free host
					    wore the same trust mark as a paying Verified Host, the
					    badge could not discriminate any two listings in a feed, and
					    the paid tier's only on-card benefit was void. The badge
					    asserts an active paid plan (contracts/card.ts
					    hasVerifiedHostSubscription) — asserting it for unpaid hosts
					    is fabricated trust. role="img" so the label is actually
					    announced rather than sitting on a generic span. */}
					{!isApplicantReview && verified ? (
						onVerificationClick ? (
							/* The badge is an ASSERTION, so it has to be able to explain
							   itself. As a button it is reachable by keyboard, by touch and
							   by a screen reader alike — there is no hover-only path to what
							   "Verified Host" does and does not mean. */
							<button
								type="button"
								className={`${styles.verifiedDot} ${styles.verifiedDotButton}`}
								onClick={() => onVerificationClick(data.id)}
								aria-label="Verified Host — what this means"
							>
								<Icon name="trust.verified_host" size={16} aria-hidden />
							</button>
						) : (
							<span className={styles.verifiedDot} role="img" aria-label="Verified Host">
								<Icon name="trust.verified_host" size={16} aria-hidden />
							</span>
						)
					) : null}
				</div>

				{/* ── CENTER-TOP SLOT: state/featured badge OR fill-quality bar ── */}

				{centerBadge ? (
					/* Action / boosted stamp — top-center */
					<div className={styles.centerSlot}>
						<span className={`${styles.stamp}${CENTER_TONE_CLASS[centerBadge.tone] ? ` ${CENTER_TONE_CLASS[centerBadge.tone]}` : ""}`}>
							{centerBadge.icon && <Icon name={centerBadge.icon} size={16} aria-hidden />}
							{centerBadge.decoration && <span aria-hidden className={styles.stampRule} />}
							{centerBadge.label}
							{centerBadge.decoration && <span aria-hidden className={styles.stampRule} />}
						</span>
					</div>
				) : showMatchCenter && data.matchScore !== undefined ? (
					/* Match score — centered pill, colour-coded by band with a mini
					   fill bar (how well it fits), keeping the % text. With a detail
					   handler the pill becomes a BUTTON: a score a seeker cannot
					   interrogate is exactly the black box this product refuses to ship,
					   and the interrogation must work by keyboard and touch, not hover. */
					(() => {
						const pillClass = `${styles.matchPill} ${matchBandClass(data.matchScore)}`
						const pillStyle = { "--dc-bar-pct": `${clampPct(data.matchScore)}%` } as CSSProperties
						const pillInner = (
							<>
								<span className={styles.matchPillNum}>{data.matchScore}%</span>
								<span className={styles.matchPillLabel}>Match</span>
								<span className={styles.matchPillTrack} aria-hidden>
									<span className={styles.matchPillFill} />
								</span>
							</>
						)
						return onMatchClick ? (
							<button
								type="button"
								className={`${pillClass} ${styles.matchPillButton}`}
								style={pillStyle}
								onClick={() => onMatchClick(data.id)}
								aria-label={`Match ${data.matchScore} percent — why this matched`}
							>
								{pillInner}
							</button>
						) : (
							<span
								className={pillClass}
								style={pillStyle}
								aria-label={`Match ${data.matchScore} percent`}
							>
								{pillInner}
							</span>
						)
					})()
				) : showHeroBar && data.fillPercent !== undefined ? (
					/* Fill-quality bar — listing scarcity signal */
					<div
						className={styles.heroBar}
						style={{ "--dc-bar-pct": `${clampPct(data.fillPercent)}%` } as CSSProperties}
					>
						<div className={styles.heroBarTrack}>
							<div className={`${styles.heroBarFill} ${styles.heroBarFillQuantity}`} />
						</div>
						<span className={`${styles.heroBarLabel} ${styles.heroBarLabelPaper}`}>
							{fillCopy(data.fillPercent)}
						</span>
					</div>
				) : null}

				{/* ── TOP-RIGHT SLOT: category + optional secondary ── */}
				<div className={styles.rightSlot}>
					{/* Category stamp — always ONE, always here; ink label + category icon/ring */}
					<span className={`${styles.stamp} ${styles.stampCategory}`}>
						<span className={styles.stampCategoryIcon}>
							<Icon name={CAT_ICON[cat]} size={16} aria-hidden />
						</span>
						{CAT_LABEL[cat]}
					</span>

					{/* Secondary badge — boosted (gold, when match took center) wins;
					    otherwise one toned state stamp. */}
					{boostedSecondary ? (
						<span className={`${styles.stamp} ${styles.stampBoostedSecondary}`}>
							<Icon name="status.boosted" size={14} aria-hidden />
							Boosted
						</span>
					) : secondaryBadge ? (
						<span className={`${styles.stamp} ${styles.stampOutline} ${SECONDARY_TONE_CLASS[secondaryBadge.tone]}`}>
							{secondaryBadge.label}
						</span>
					) : null}
				</div>

				{/* Previously skipped — subtle bottom-left photo marker (demoted-but-
				    visible; the swipe deck excludes skipped so never renders this). */}
				{previouslySkipped ? (
					<span className={styles.skippedMarker}>
						<Icon name="action.close" size={14} aria-hidden />
						Previously skipped
					</span>
				) : null}

				{/* Image-zone actions — bottom-right cluster.
				    Save appears here ONLY when the decision bar below is not rendered:
				    two Save controls on one card is two places to wonder whether the
				    first one worked. Share is always available when a handler exists. */}
				{onShare || onReport || (onSave && !showDecisionBar) ? (
					<div className={styles.heroActions}>
						{onSave && !showDecisionBar ? (
							<button
								type="button"
								className={styles.heroActionBtn}
								onClick={() => onSave(data.id)}
								aria-label={isSaved ? "Saved" : "Save this opportunity"}
								aria-pressed={isSaved}
							>
								<Icon name="nav.saved" size={20} aria-hidden />
							</button>
						) : null}
						{onShare ? (
							<button
								type="button"
								className={styles.heroActionBtn}
								onClick={() => onShare(data.id)}
								aria-label="Share this opportunity"
							>
								<Icon name="action.share" size={20} aria-hidden />
							</button>
						) : null}
						{onReport ? (
							<button
								type="button"
								className={styles.heroActionBtn}
								onClick={() => onReport(data.id)}
								aria-label="Report listing"
							>
								<Icon name="action.report" size={20} aria-hidden />
							</button>
						) : null}
					</div>
				) : null}
			</div>

			{/* ── INFO ROWS ── */}
			<div className={styles.body}>

				{/* Sourced disclosure — the FIRST thing in the body, full-width and
				    unmissable. Never softened: this listing is real and attributable
				    but NOT confirmed by Explore & Earn (no host, no verified badge). */}
				{isSourced ? (
					<div className={styles.sourcedRibbon}>
						<Icon name="system.info" size={14} aria-hidden />
						<span>{SOURCED_DISCLOSURE_LABEL}</span>
					</div>
				) : null}

				{/* 2. HOST NAME — icon + name (icon in every field) */}
				{(() => {
					// Sourced listings carry NO verified-host glyph on the name row —
					// the employer name is source-stated, not a verified host.
					// UX review 2026-07-23: the non-sourced branch handed the SealCheck
					// (trust.verified_host) glyph to EVERY host listing — a second,
					// ungated verification-shaped mark beside the host's name. Only a
					// genuinely verified host earns it; everyone else gets the neutral
					// host glyph.
					const hostIcon = isApplicantReview
						? "nav.profile"
						: verified
							? "trust.verified_host"
							: "nav.hosts"
					// Employer logo chip — only for a real host profile. A sourced
					// listing never reaches here with one (the mapper withholds it), so
					// a scraped posting can never wear an employer's mark.
					const mark = data.employerLogoUrl && !isSourced && !isApplicantReview ? (
						<img
							src={data.employerLogoUrl}
							alt=""
							loading="lazy"
							decoding="async"
							className={styles.employerMark}
						/>
					) : (
						<Icon name={hostIcon} size={18} aria-hidden />
					)
					return titleHandler ? (
						<button type="button" className={`${styles.metaRow} ${styles.hostRow}`} onClick={titleHandler}>
							{mark}
							<span className={styles.hostName}>{data.hostName}</span>
						</button>
					) : (
						<div className={`${styles.metaRow} ${styles.hostRow}`}>
							{mark}
							<span className={styles.hostName}>{data.hostName}</span>
						</div>
					)
				})()}

				{/* 3. JOB TITLE — the card's single dominant text element */}
				{onOpen ? (
					<button type="button" className={`${styles.metaRow} ${styles.titleRow}`} onClick={() => onOpen(data.id)}>
						<Icon name={CAT_ICON[cat]} size={20} aria-hidden />
						<span className={styles.title}>{roleText}</span>
					</button>
				) : (
					<div className={`${styles.metaRow} ${styles.titleRow}`}>
						<Icon name={CAT_ICON[cat]} size={20} aria-hidden />
						<span className={styles.title}>{roleText}</span>
					</div>
				)}

				{/* 4. LOCATION — only when a real place is known */}
				{hasLocation ? (
					onLocationClick ? (
						<button type="button" className={`${styles.metaRow} ${styles.locationRow}`} onClick={() => onLocationClick(data.id)}>
							<Icon name={MAPPIN[cat]} size={20} aria-hidden />
							<span className={styles.location}>{data.location}</span>
						</button>
					) : (
						<div className={`${styles.metaRow} ${styles.locationRow}`}>
							<Icon name={MAPPIN[cat]} size={20} aria-hidden />
							<span className={styles.location}>{data.location}</span>
						</div>
					)
				) : null}

				{/* 5. TIMING — concrete BEGINS | ENDS when known, else the opportunity
				    window. A dates handler turns the whole strip into ONE button
				    (season window, length and listing close live in the popover), so
				    the detail is reachable by keyboard and touch, never by hover. */}
				{(() => {
					const datesInner = hasDates ? (
						<>
							<span className={styles.dateCell}>
								<span className={styles.dateLabel}>
									<Icon name="status.begins" size={16} aria-hidden />
									Begins
								</span>
								<span className={styles.dateValue}>{data.begins ?? "Flexible"}</span>
							</span>
							<span className={styles.dateCell}>
								<span className={styles.dateLabel}>
									<Icon name="status.ends" size={16} aria-hidden />
									Ends
								</span>
								<span className={styles.dateValue}>{data.ends ?? "Flexible"}</span>
							</span>
						</>
					) : null
					const datesLabel = hasDates
						? `Dates: ${data.begins ?? "flexible"} to ${data.ends ?? "flexible"}`
						: `Timing: ${data.opportunityWindow || "open"}`

					if (hasDates) {
						return onDatesClick ? (
							<button
								type="button"
								className={`${styles.datesRow} ${styles.datesRowButton}`}
								onClick={() => onDatesClick(data.id)}
								aria-label={`${datesLabel} — season details`}
							>
								{datesInner}
							</button>
						) : (
							<div className={styles.datesRow}>{datesInner}</div>
						)
					}

					return onDatesClick ? (
						<button
							type="button"
							className={`${styles.windowRow} ${styles.datesRowButton}`}
							onClick={() => onDatesClick(data.id)}
							aria-label={`${datesLabel} — season details`}
						>
							<Icon name="status.begins" size={16} aria-hidden />
							<span className={styles.dateValue}>{data.opportunityWindow || "Open timing"}</span>
						</button>
					) : (
						<div className={styles.windowRow}>
							<Icon name="status.begins" size={16} aria-hidden />
							<span className={styles.dateValue}>{data.opportunityWindow || "Open timing"}</span>
						</div>
					)
				})()}

				{/* 6. SKILLS (applicant review) or HOUSING | MEALS | PAY */}
				{isApplicantReview && data.skills && data.skills.length > 0 ? (
					/* Top skills in place of H/M/P on applicant card */
					<div className={styles.skills}>
						{data.skills.slice(0, 3).map((skill) => (
							<span key={skill} className={styles.skill}>
								{skill}
							</span>
						))}
					</div>
				) : (
					/* HOUSING · MEALS · PAY — the card's dominant module. Green ✓ =
					   offered, red ✕ = not offered (icon + colour, a11y-safe); Pay
					   is always gold and carries the rate. */
					<div className={styles.triad}>
						<BenefitTriadCell
							kind="housing"
							state={housingState}
							value={data.triad.housing}
							onClick={canOpenHousing ? () => onHousingClick!(data.id) : undefined}
						/>
						<BenefitTriadCell
							kind="meals"
							state={mealsState}
							value={data.triad.meals}
							onClick={canOpenMeals ? () => onMealsClick!(data.id) : undefined}
						/>
						<BenefitTriadCell
							kind="pay"
							state={payState}
							value={data.triad.pay}
							onClick={onPayClick ? () => onPayClick(data.id) : undefined}
						/>
					</div>
				)}

				{/* Core decision snapshot — Match, season length and the host's own
				    Housing/Meals wording remain visible on every seeker listing card.
				    Missing values are explicit, never silently omitted. */}
				{!isApplicantReview && !isAdminReview ? (
					<dl className={`${styles.factList} ${styles.glanceFacts}`} aria-label="Opportunity at a glance">
						{glanceFacts.map((fact) => (
							<div key={fact.key} className={styles.factItem}>
								<dt className={styles.factLabel}>{fact.label}</dt>
								<dd
									className={styles.factValue}
									data-state={
										fact.key === "match" && fact.value === "Not scored"
											? "not_scored"
											: fact.value === NOT_STATED_LABEL
												? "not_stated"
												: undefined
									}
								>
									{fact.value}
								</dd>
							</div>
						))}
					</dl>
				) : null}

				{/* ── 8. STATED FACTS (V2-G info zone) ──────────────────────────────
				    Season length, experience, physical demand, and the host's own
				    housing/meals summaries. Rendered ONLY where a host actually filled
				    the column in — an empty list produces no section, because a row of
				    em-dashes is a worse answer than no row. */}
				{!isApplicantReview && (facts.length > 0 || topPerks.length > 0) ? (
					<div className={styles.facts}>
						{facts.length > 0 ? (
							<dl className={styles.factList}>
								{facts.map((fact) => (
									<div key={fact.key} className={styles.factItem}>
										<dt className={styles.factLabel}>{fact.label}</dt>
										<dd className={styles.factValue}>{fact.value}</dd>
									</div>
								))}
							</dl>
						) : null}
						{topPerks.length > 0 ? (
							<ul className={styles.perks} aria-label="Listed benefits">
								{topPerks.map((perk) => (
									<li key={perk} className={styles.perk}>
										{perk}
									</li>
								))}
							</ul>
						) : null}
					</div>
				) : null}

				{/* ── 9. DECISION META ──────────────────────────────────────────────
				    Why this matched, when the listing closes, and what the host has
				    left unanswered. All three are decision inputs, so they sit
				    immediately above the decision itself. */}
				{!isApplicantReview && !isAdminReview &&
				(showReasons || data.closesOn || missingSentence) ? (
					<div className={styles.decisionMeta}>
						{showReasons ? (
							<p className={styles.reasons}>
								<Icon name="status.match" size={14} aria-hidden />
								<span>
									Strong on {reasonLabels.join(" · ")}
									{lowConfidence ? " — based on a partly-filled profile" : ""}
								</span>
								{onMatchClick ? (
									<button
										type="button"
										className={styles.reasonsMore}
										onClick={() => onMatchClick(data.id)}
									>
										Why?
									</button>
								) : null}
							</p>
						) : null}

						{data.closesOn ? (
							/* "Listing closes", never "apply by": the schema stores an
							   expiry, not a deadline, and the two make different promises. */
							<p className={styles.closes}>
								<Icon name="status.ends" size={14} aria-hidden />
								Listing closes {data.closesOn}
							</p>
						) : null}

						{missingSentence ? (
							<p
								className={styles.missing}
								data-reduced={record.reducedConfidence ? "true" : undefined}
							>
								<Icon name="system.info" size={14} aria-hidden />
								<span>
									{missingSentence}. {record.completeness}% of this listing is answered.
								</span>
							</p>
						) : null}
					</div>
				) : null}

				{/* 7. CTA — admin_review: Approve/Hold/Reject strip; host_applicant_review: Skip/Save/Schedule strip; all other surfaces: single stamp button */}
				{actions ?? (
					isAdminReview && (onApprove || onHold || onReject) ? (
						<div className={styles.actionStrip}>
							{onApprove ? (
								<button
									type="button"
									className={`${styles.actionBtn} ${styles.actionApprove}`}
									disabled={adminActionsDisabled}
									onClick={() => onApprove(data.id)}
								>
									<Icon name="system.success" size={16} aria-hidden />
									Approve
								</button>
							) : null}
							{onHold ? (
								<button
									type="button"
									className={`${styles.actionBtn} ${styles.actionHold}`}
									disabled={adminActionsDisabled}
									onClick={() => onHold(data.id)}
								>
									<Icon name="system.info" size={16} aria-hidden />
									Hold
								</button>
							) : null}
							{onReject ? (
								<button
									type="button"
									className={`${styles.actionBtn} ${styles.actionReject}`}
									disabled={adminActionsDisabled}
									onClick={() => onReject(data.id)}
								>
									<Icon name="action.close" size={16} aria-hidden />
									Reject
								</button>
							) : null}
						</div>
					) : isApplicantReview ? (
						<div className={styles.actionStrip}>
							{/* SKIP — active dark stamp */}
							<button
								type="button"
								className={`${styles.actionBtn} ${styles.actionSkip}`}
								onClick={onSkip ? () => onSkip(data.id) : undefined}
							>
								<span aria-hidden className={styles.stampRule} />
								Skip
								<span aria-hidden className={styles.stampRule} />
							</button>

							{/* SAVE — neutral bordered */}
							<button
								type="button"
								className={`${styles.actionBtn} ${styles.actionSave}`}
								onClick={onSave ? () => onSave!(data.id) : undefined}
							>
								Save
							</button>

							{/* SCHEDULE — gold bordered */}
							<button
								type="button"
								className={`${styles.actionBtn} ${styles.actionSchedule}`}
								onClick={onSchedule ? () => onSchedule!(data.id) : onOpen ? () => onOpen(data.id) : undefined}
							>
								Schedule
							</button>
						</div>
					) : showDecisionBar ? (
						/* Seeker decision bar — ALWAYS Skip · Apply · Save at 20/60/20. */
						<div className={styles.ctaRow}>
							<button
								type="button"
								className={`${styles.ctaBtn} ${styles.ctaSkip} ui-pressable`}
								onClick={onSkip ? () => onSkip(data.id) : undefined}
								aria-label="Skip this opportunity"
							>
								Skip
							</button>
							<button
								type="button"
								className={`${styles.ctaBtn} ${styles.ctaApply} ui-pressable`}
								onClick={onApply ? () => onApply(data.id) : undefined}
							>
								Apply
								<Icon name="action.forward" size={16} aria-hidden />
							</button>
							<button
								type="button"
								className={`${styles.ctaBtn} ${styles.ctaSave} ui-pressable`}
								onClick={onSave ? () => onSave(data.id) : undefined}
								aria-label="Save this opportunity"
							>
								Save
							</button>
						</div>
					) : (
						<button
							type="button"
							className={ctaClass}
							disabled={ctaDisabled}
							onClick={ctaHandler}
						>
							{!isPassiveCta && <Icon name="action.apply" size={16} aria-hidden />}
							{ctaLabel}
							{!isPassiveCta && <Icon name="action.forward" size={16} aria-hidden />}
						</button>
					)
				)}
			</div>
		</article>
	)
}
