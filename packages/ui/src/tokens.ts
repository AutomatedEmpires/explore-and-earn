/**
 * Typed design-token contract (canon mirror).
 *
 * Canon: docs/design/design-system-v1.md (founder-locked 2026-05-30). The VALUES
 * live in apps/web/styles/tokens.css. This module exposes the SEMANTIC token
 * *names* (and the locked scales/enums) so feature code references tokens — never
 * raw hex, px type sizes, or ad-hoc radii (drift rule #1; planned raw-hex CI check).
 *
 * Usage:
 *   import { COLOR_TOKENS, cssVar } from "@explore-and-earn/ui";
 *   const bg = cssVar(COLOR_TOKENS.surface); // => "var(--color-surface)"
 */

/** A CSS custom-property name, e.g. "--color-surface". */
export type CssVarName = `--${string}`

/** Wrap a token name in a CSS var() reference: cssVar("--color-surface") => "var(--color-surface)". */
export function cssVar(name: CssVarName): string {
	return `var(${name})`
}

/** An accent pair: chip background + ink foreground (never color-only). */
export interface AccentPair {
	bg: CssVarName
	fg: CssVarName
}

/* ---- surfaces / text / borders ---- */
export const COLOR_TOKENS = {
	paper: "--color-paper",
	surface: "--color-surface",
	surfaceRaised: "--color-surface-raised",
	borderSoft: "--border-soft",
	borderInk: "--border-ink",
	textPrimary: "--text-primary",
	textSecondary: "--text-secondary",
	textMuted: "--text-muted",
} as const satisfies Record<string, CssVarName>

/* ---- category accents (lanes) ---- */
export const CATEGORY_KEYS = [
	"farm",
	"maritime",
	"remote",
	"seasonal",
	"mix",
] as const
export type CategoryKey = (typeof CATEGORY_KEYS)[number]

export const CATEGORY_ACCENTS = {
	farm: { bg: "--accent-farm-bg", fg: "--accent-farm-fg" },
	maritime: { bg: "--accent-maritime-bg", fg: "--accent-maritime-fg" },
	remote: { bg: "--accent-remote-bg", fg: "--accent-remote-fg" },
	seasonal: { bg: "--accent-seasonal-bg", fg: "--accent-seasonal-fg" },
	mix: { bg: "--accent-mix-bg", fg: "--accent-mix-fg" },
} as const satisfies Record<CategoryKey, AccentPair>

/* ---- benefit triad accents (HOUSING / MEALS / PAY) ---- */
export const BENEFIT_KEYS = ["housing", "meals", "pay"] as const
export type BenefitKey = (typeof BENEFIT_KEYS)[number]

export const BENEFIT_ACCENTS = {
	housing: { bg: "--benefit-housing-bg", fg: "--benefit-housing-fg" },
	meals: { bg: "--benefit-meals-bg", fg: "--benefit-meals-fg" },
	pay: { bg: "--benefit-pay-bg", fg: "--benefit-pay-fg" },
} as const satisfies Record<BenefitKey, AccentPair>

/* ---- status / system accents ---- */
export const STATUS_ACCENT_KEYS = [
	"boosted",
	"match",
	"featured",
	"verified_host",
	"founding_host",
	"success",
	"warning",
	"error",
] as const
export type StatusAccentKey = (typeof STATUS_ACCENT_KEYS)[number]

export const STATUS_ACCENTS = {
	boosted: { bg: "--status-boosted-bg", fg: "--status-boosted-fg" },
	match: { bg: "--status-match-bg", fg: "--status-match-fg" },
	featured: { bg: "--status-featured-bg", fg: "--status-featured-fg" },
	verified_host: { bg: "--status-verified_host-bg", fg: "--status-verified_host-fg" },
	founding_host: { bg: "--status-founding_host-bg", fg: "--status-founding_host-fg" },
	success: { bg: "--status-success-bg", fg: "--status-success-fg" },
	warning: { bg: "--status-warning-bg", fg: "--status-warning-fg" },
	error: { bg: "--status-error-bg", fg: "--status-error-fg" },
} as const satisfies Record<StatusAccentKey, AccentPair>

/* ---- spacing (4px base) ---- */
export const SPACE_TOKENS = {
	s2: "--space-2",
	s4: "--space-4",
	s8: "--space-8",
	s12: "--space-12",
	s16: "--space-16",
	s20: "--space-20",
	s24: "--space-24",
	s32: "--space-32",
	s40: "--space-40",
	s48: "--space-48",
} as const satisfies Record<string, CssVarName>

export const LAYOUT_TOKENS = {
	cardPadding: "--space-card",
	rowGap: "--space-row-gap",
	section: "--space-section",
	gutter: "--space-gutter",
	bottomNavHeight: "--size-bottom-nav",
} as const satisfies Record<string, CssVarName>

/* ---- radius ---- */
export const RADIUS_TOKENS = {
	pill: "--radius-pill",
	input: "--radius-input",
	button: "--radius-button",
	cell: "--radius-cell",
	image: "--radius-image",
	card: "--radius-card",
	modal: "--radius-modal",
} as const satisfies Record<string, CssVarName>

/* ---- elevation (overlays only; cards are flat/borders-first) ---- */
export const ELEVATION_TOKENS = {
	overlay: "--elevation-overlay",
	pin: "--elevation-pin",
} as const satisfies Record<string, CssVarName>

/* ---- motion ---- */
export const MOTION_TOKENS = {
	fast: "--motion-fast",
	base: "--motion-base",
	drawer: "--motion-drawer",
	easeStandard: "--ease-standard",
} as const satisfies Record<string, CssVarName>

/* ---- typography ---- */
export const FONT_TOKENS = {
	display: "--font-display",
	ui: "--font-ui",
	accent: "--font-accent",
} as const satisfies Record<string, CssVarName>

export const TYPE_ROLE_KEYS = [
	"display",
	"page",
	"section",
	"card",
	"body",
	"meta",
	"caption",
	"button",
	"label",
] as const
export type TypeRoleKey = (typeof TYPE_ROLE_KEYS)[number]

/* ---- numeric scales (real values, mirror of the css px tokens) ---- */
export const ICON_SIZE = {
	sm: 16,
	md: 20,
	lg: 24,
	chip: 40,
	chipCompact: 36,
} as const

export const BREAKPOINTS = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
} as const

/* ---- component states every primitive must support ---- */
export const COMPONENT_STATES = [
	"default",
	"hover",
	"focus",
	"active",
	"disabled",
	"locked",
	"loading",
	"empty",
	"error",
	"success",
	"warning",
	"critical",
] as const
export type ComponentState = (typeof COMPONENT_STATES)[number]
