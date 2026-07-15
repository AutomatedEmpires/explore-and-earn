/**
 * Typed design-token contract (canon mirror).
 *
 * Canon: docs/superpowers/specs/2026-06-21-design-system-v2-golden-hour-hybrid.md.
 * The VALUES live in apps/web/styles/tokens.css. This module exposes the SEMANTIC token
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
	surfaceSunken: "--color-surface-sunken",
	surfaceRaised: "--color-surface-raised",
	borderSoft: "--border-soft",
	borderStrong: "--border-strong",
	borderInk: "--border-ink",
	textPrimary: "--text-primary",
	textSecondary: "--text-secondary",
	textMuted: "--text-muted",
	cta: "--color-cta",
	ctaText: "--color-cta-text",
	panelDark: "--color-panel-dark",
	onDark: "--text-on-dark",
	onDarkMuted: "--text-on-dark-muted",
	onDarkBorder: "--border-on-dark",
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

export const CATEGORY_GRADIENTS = {
	farm: "--gradient-cat-farm",
	maritime: "--gradient-cat-maritime",
	remote: "--gradient-cat-remote",
	seasonal: "--gradient-cat-seasonal",
	mix: "--gradient-cat-mix",
} as const satisfies Record<CategoryKey, CssVarName>

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
	"info",
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
	info: { bg: "--status-info-bg", fg: "--status-info-fg" },
} as const satisfies Record<StatusAccentKey, AccentPair>

/* ---- spacing ---- */
export const SPACE_TOKENS = {
	s2: "--space-2",
	s3: "--space-3",
	s4: "--space-4",
	s6: "--space-6",
	s8: "--space-8",
	s10: "--space-10",
	s12: "--space-12",
	s14: "--space-14",
	s16: "--space-16",
	s18: "--space-18",
	s20: "--space-20",
	s24: "--space-24",
	s32: "--space-32",
	s40: "--space-40",
	s48: "--space-48",
	s64: "--space-64",
	s80: "--space-80",
} as const satisfies Record<string, CssVarName>

export const LAYOUT_TOKENS = {
	cardPadding: "--space-card",
	rowGap: "--space-row-gap",
	section: "--space-section",
	gutter: "--space-gutter",
	bottomNavHeight: "--size-bottom-nav",
} as const satisfies Record<string, CssVarName>

export const LAYER_TOKENS = {
	contentBar: "--z-content-bar",
	header: "--z-header",
	dock: "--z-dock",
	banner: "--z-banner",
	overlay: "--z-overlay",
	lightbox: "--z-lightbox",
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

/* ---- elevation ---- */
export const ELEVATION_TOKENS = {
	whisper: "--elev-whisper",
	card: "--elev-card",
	hover: "--elev-raised",
	raised: "--elev-raised",
	overlay: "--elevation-overlay",
	glow: "--elev-glow",
	pin: "--elevation-pin",
} as const satisfies Record<string, CssVarName>

/* ---- motion ---- */
export const MOTION_TOKENS = {
	fast: "--motion-fast",
	base: "--motion-base",
	slow: "--motion-slow",
	drawer: "--motion-drawer",
	easeOut: "--ease-out",
	easeStandard: "--ease-standard",
} as const satisfies Record<string, CssVarName>

/* ---- gradients ---- */
export const GRADIENT_TOKENS = {
	goldenHour: "--gradient-goldenhour",
	auroraSoft: "--gradient-aurora-soft",
	amber: "--gradient-amber",
	teal: "--gradient-teal",
	meter: "--gradient-meter",
} as const satisfies Record<string, CssVarName>

export const TEXTURE_TOKENS = {
	grain: "--grain",
	grainSize: "--grain-size",
	grainOpacity: "--grain-opacity",
} as const satisfies Record<string, CssVarName>

/* ---- typography ---- */
export const FONT_TOKENS = {
	display: "--font-display",
	ui: "--font-ui",
	/** @deprecated Golden Hour uses the display family for legacy accent roles. */
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
	xs: 380,
	compact: 480,
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	xxl: 1536,
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
