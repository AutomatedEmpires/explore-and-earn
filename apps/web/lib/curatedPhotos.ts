/**
 * Curated photo sets — the predefined COVER + LOGO options offered everywhere a
 * user can personalize their page (seeker profile, host public profile, admin).
 *
 * ── Founder-editable in ONE place ────────────────────────────────────────────
 * Every predefined option the product offers lives in this file. To add / swap
 * a cover or logo placeholder, edit the arrays below — nothing else changes.
 *
 * Rules honored here (v2.2 / v2.3):
 *  - COVER is ALWAYS a separate concept from LOGO.
 *  - The three scopes (seeker · host · admin) get DISTINCT sets — never the same
 *    set across scopes.
 *  - Uploading your own is always preferred; these are the fallback presets.
 *  - We NEVER fabricate a real business logo. Logo presets are generic/abstract
 *    monogram tiles (a glacier-token gradient the consumer can stamp an initial
 *    onto) — not imitation brand marks.
 *  - Every preset below is a GRADIENT drawn from tokens.css. The curated photo
 *    presets were removed with the image CDN they were delivered from: we serve
 *    no marketing photography we do not hold, and a preset must never point at
 *    an asset that is not there. `kind: "photo"` stays a first-class case
 *    because a user's OWN uploaded cover (Supabase Storage) renders through it,
 *    and photo presets return here the moment curated photography lands in the
 *    `site-photos` bucket (see scripts/seed-site-photos.mjs +
 *    docs/design/site-photos.md).
 */

export type CuratedScope = "seeker" | "host" | "admin";

/**
 * A predefined cover option. `kind` tells the consumer how to render `value`:
 *  - "photo"    → an <Image src={value}> (a real image URL, framed).
 *  - "gradient" → a background of `value` (a `var(--gradient-*)` token).
 */
export interface CuratedCover {
  readonly key: string;
  readonly label: string;
  readonly kind: "photo" | "gradient";
  readonly value: string;
}

/**
 * A predefined logo placeholder — an abstract monogram tile. `gradient` is the
 * tile background (a token); `monogram` is an optional single glyph the consumer
 * may render centered. These are deliberately generic, never real logos.
 */
export interface CuratedLogo {
  readonly key: string;
  readonly label: string;
  readonly gradient: string;
  readonly monogram: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const gradientCover = (key: string, label: string, token: string): CuratedCover => ({
  key,
  label,
  kind: "gradient",
  value: token,
});

// ── COVER sets — distinct per scope ──────────────────────────────────────────

/** Seeker covers: aspirational, on-the-move, "where I want to be." */
const SEEKER_COVERS: readonly CuratedCover[] = [
  gradientCover("seeker-adventure", "Adventure", "var(--gradient-cover-adventure)"),
  gradientCover("seeker-coastal", "Coastal", "var(--gradient-cover-coastal)"),
  gradientCover("seeker-sunset", "Sunset", "var(--gradient-cover-sunset)"),
  gradientCover("seeker-golden", "Golden hour", "var(--gradient-gold)"),
  gradientCover("seeker-backcountry", "Backcountry", "var(--gradient-category-remote)"),
];

/** Host covers: the working landscape — farm, water, the place seekers arrive. */
const HOST_COVERS: readonly CuratedCover[] = [
  gradientCover("host-wilderness", "Wilderness", "var(--gradient-cover-wilderness)"),
  gradientCover("host-mountain", "Mountain", "var(--gradient-cover-mountain)"),
  gradientCover("host-farm", "Farmland", "var(--gradient-category-farm)"),
  gradientCover("host-harbor", "Harbor", "var(--gradient-category-maritime)"),
  gradientCover("host-season", "Season", "var(--gradient-category-seasonal)"),
  gradientCover("host-mixed", "Mixed lanes", "var(--gradient-category-mix)"),
];

/** Admin covers: calm, systemic, brand-neutral chrome — no photography. */
const ADMIN_COVERS: readonly CuratedCover[] = [
  gradientCover("admin-chrome", "Chrome", "var(--gradient-chrome)"),
  gradientCover("admin-ice", "Ice", "var(--gradient-ice)"),
  gradientCover("admin-sky", "Sky", "var(--gradient-sky)"),
  gradientCover("admin-sky-soft", "Soft sky", "var(--gradient-sky-soft)"),
];

const COVERS_BY_SCOPE: Record<CuratedScope, readonly CuratedCover[]> = {
  seeker: SEEKER_COVERS,
  host: HOST_COVERS,
  admin: ADMIN_COVERS,
};

// ── LOGO placeholder sets — abstract monograms, distinct per scope ───────────

/** Seeker logo placeholders: warm, personable. */
const SEEKER_LOGOS: readonly CuratedLogo[] = [
  { key: "seeker-logo-gold", label: "Gold", gradient: "var(--gradient-gold)", monogram: "★" },
  { key: "seeker-logo-sunset", label: "Sunset", gradient: "var(--gradient-cover-sunset)", monogram: "◆" },
  { key: "seeker-logo-action", label: "Action", gradient: "var(--gradient-action)", monogram: "●" },
  { key: "seeker-logo-sky", label: "Sky", gradient: "var(--gradient-sky-soft)", monogram: "▲" },
];

/** Host logo placeholders: cooler, organizational. */
const HOST_LOGOS: readonly CuratedLogo[] = [
  { key: "host-logo-chrome", label: "Chrome", gradient: "var(--gradient-chrome)", monogram: "◆" },
  { key: "host-logo-maritime", label: "Maritime", gradient: "var(--gradient-category-maritime)", monogram: "≈" },
  { key: "host-logo-farm", label: "Farm", gradient: "var(--gradient-category-farm)", monogram: "❖" },
  { key: "host-logo-mountain", label: "Mountain", gradient: "var(--gradient-cover-mountain)", monogram: "▲" },
];

/** Admin logo placeholders: neutral system marks. */
const ADMIN_LOGOS: readonly CuratedLogo[] = [
  { key: "admin-logo-chrome", label: "Chrome", gradient: "var(--gradient-chrome)", monogram: "■" },
  { key: "admin-logo-ice", label: "Ice", gradient: "var(--gradient-ice)", monogram: "◆" },
];

const LOGOS_BY_SCOPE: Record<CuratedScope, readonly CuratedLogo[]> = {
  seeker: SEEKER_LOGOS,
  host: HOST_LOGOS,
  admin: ADMIN_LOGOS,
};

// ── Public accessors ─────────────────────────────────────────────────────────

/** Predefined cover options for a scope (cover is always separate from logo). */
export function curatedCovers(scope: CuratedScope): readonly CuratedCover[] {
  return COVERS_BY_SCOPE[scope];
}

/** Predefined logo placeholder options for a scope. */
export function curatedLogos(scope: CuratedScope): readonly CuratedLogo[] {
  return LOGOS_BY_SCOPE[scope];
}

/** True when a cover option should render as a photo (vs a gradient background). */
export function isPhotoCover(cover: CuratedCover): boolean {
  return cover.kind === "photo";
}
