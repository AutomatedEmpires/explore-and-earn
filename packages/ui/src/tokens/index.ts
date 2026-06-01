/**
 * Typed token contract for Design System V1.
 *
 * Maps stable token names to the CSS custom properties declared in
 * apps/web/styles/tokens.css (founder-LOCKED values, 2026-05-30). Components
 * import these token names and resolve to `var(--...)` — they MUST NOT
 * reference raw hex/px/font literals. A value change happens in tokens.css
 * (one place) and re-themes everything with zero component edits.
 */

export const color = {
  paper: "var(--color-paper)",
  surface: "var(--color-surface)",
  surfaceRaised: "var(--color-surface-raised)",
  borderSoft: "var(--border-soft)",
  borderInk: "var(--border-ink)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",
} as const;

export const categoryAccent = {
  farm: { bg: "var(--farm-bg)", ink: "var(--farm-ink)" },
  maritime: { bg: "var(--maritime-bg)", ink: "var(--maritime-ink)" },
  remote: { bg: "var(--remote-bg)", ink: "var(--remote-ink)" },
  seasonal: { bg: "var(--seasonal-bg)", ink: "var(--seasonal-ink)" },
  mix: { bg: "var(--mix-bg)", ink: "var(--mix-ink)" },
} as const;

export const benefitAccent = {
  housing: { bg: "var(--housing-bg)", ink: "var(--housing-ink)" },
  meals: { bg: "var(--meals-bg)", ink: "var(--meals-ink)" },
  pay: { bg: "var(--pay-bg)", ink: "var(--pay-ink)" },
} as const;

export const statusAccent = {
  boosted: { bg: "var(--boosted-bg)", ink: "var(--boosted-ink)" },
  match: { bg: "var(--match-bg)", ink: "var(--match-ink)" },
  featured: { bg: "var(--featured-bg)", ink: "var(--featured-ink)" },
  verifiedHost: { bg: "var(--verified-bg)", ink: "var(--verified-ink)" },
  foundingHost: { bg: "var(--founding-bg)", ink: "var(--founding-ink)" },
  success: { bg: "var(--success-bg)", ink: "var(--success-ink)" },
  warning: { bg: "var(--warning-bg)", ink: "var(--warning-ink)" },
  error: { bg: "var(--error-bg)", ink: "var(--error-ink)" },
} as const;

export const font = {
  display: "var(--font-display)",
  ui: "var(--font-ui)",
  accent: "var(--font-accent)",
} as const;

export const fontWeight = {
  regular: "var(--font-weight-regular)",
  medium: "var(--font-weight-medium)",
  semibold: "var(--font-weight-semibold)",
} as const;

export const space = {
  s2: "var(--space-2)", s4: "var(--space-4)", s8: "var(--space-8)",
  s12: "var(--space-12)", s16: "var(--space-16)", s20: "var(--space-20)",
  s24: "var(--space-24)", s32: "var(--space-32)", s40: "var(--space-40)",
  s48: "var(--space-48)",
} as const;

export const radius = {
  pill: "var(--radius-pill)",
  input: "var(--radius-input)",
  button: "var(--radius-button)",
  row: "var(--radius-row)",
  image: "var(--radius-image)",
  card: "var(--radius-card)",
  sheet: "var(--radius-sheet)",
} as const;

export const elevation = {
  flat: "var(--elevation-flat)",
  overlay: "var(--elevation-overlay)",
  pin: "var(--elevation-pin)",
} as const;

export const motion = {
  fast: "var(--motion-fast)",
  base: "var(--motion-base)",
  drawer: "var(--motion-drawer)",
  ease: "var(--motion-ease)",
} as const;

export const iconSize = {
  sm: "var(--icon-sm)",
  md: "var(--icon-md)",
  lg: "var(--icon-lg)",
  chip: "var(--icon-chip)",
  chipCompact: "var(--icon-chip-compact)",
} as const;

/** Reference breakpoints (px mirror tokens.css; for JS / container queries). */
export const breakpoint = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const tokens = {
  color,
  categoryAccent,
  benefitAccent,
  statusAccent,
  font,
  fontWeight,
  space,
  radius,
  elevation,
  motion,
  iconSize,
  breakpoint,
} as const;

export type ColorToken = keyof typeof color;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
export type CategoryAccentKey = keyof typeof categoryAccent;

/** Resolve a CSS variable name to a `var()` reference. */
export function cssVar(name: string): string {
  return `var(--${name})`;
}
