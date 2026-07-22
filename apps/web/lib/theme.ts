/**
 * Theme contract — Glacier Light/Dark/System.
 *
 * Single source of truth for how the theme preference is stored, resolved and
 * applied. Everything that touches the theme (the no-flash bootstrap in
 * app/layout.tsx, the header ThemeSwitcher, the Settings AppearanceControl,
 * public/offline.html) derives from the rules here — never re-implement them
 * privately (a private copy is how honesty bugs creep back in).
 *
 * The contract:
 *   • Preference values: "light" | "dark" | "system". The legacy stored value
 *     "auto" (clock-driven, pre-2026-07-22) normalizes to "system".
 *   • DEFAULT ENTRY (nothing stored anywhere): LIGHT (founder 2026-07-22 —
 *     supersedes the 2026-07 dark default; Dark/System are opt-in).
 *   • "system" follows the OS `prefers-color-scheme` — no clock component.
 *   • The applied theme lives ONLY in `<html data-theme="light|dark">` +
 *     `style.colorScheme`. tokens.css keys off `:root[data-theme="dark"]` and
 *     `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`,
 *     so a root with NO data-theme attribute renders the OS theme in pure CSS.
 *   • Persistence is dual: localStorage "ee-theme" (client authority) + the
 *     "ee-theme" cookie (SSR mirror, 1 year, path=/, SameSite=Lax). SSR renders
 *     the right `data-theme` from the cookie so there is no flash of the wrong
 *     theme; the render-blocking bootstrap remains the client authority and
 *     keeps both stores in sync (it never writes for a first-time visitor, so
 *     "no preference" stays distinguishable from "chose the default").
 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** localStorage key (client authority). Persisted as "light"|"dark"|"system". */
export const THEME_STORAGE_KEY = "ee-theme";
/** Cookie name (SSR mirror). Same value space as the storage key. */
export const THEME_COOKIE_NAME = "ee-theme";
/** Cookie lifetime — one year. */
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** DEFAULT ENTRY when no preference is stored anywhere (founder 2026-07-22). */
export const DEFAULT_THEME_PREF: ThemePref = "light";

/**
 * Normalize a raw stored value to a ThemePref, or null when unrecognized.
 * The legacy "auto" (clock 20:00–06:00 + OS, retired 2026-07-22) maps to
 * "system" so previously stored preferences keep working.
 */
export function normalizeThemePref(raw: unknown): ThemePref | null {
	if (raw === "light" || raw === "dark" || raw === "system") return raw;
	if (raw === "auto") return "system";
	return null;
}

/** Resolve a preference to the applied theme given the OS color-scheme. */
export function resolveThemePref(
	pref: ThemePref,
	osPrefersDark: boolean,
): ResolvedTheme {
	if (pref === "system") return osPrefersDark ? "dark" : "light";
	return pref;
}

/**
 * The `data-theme` attribute SSR should emit for a (cookie-sourced) preference.
 *   • "light"/"dark" — emitted verbatim.
 *   • "system" — undefined (attribute omitted): tokens.css's
 *     `@media (prefers-color-scheme: dark)` block then paints the OS theme with
 *     zero JS, and the bootstrap pins the resolved value pre-paint.
 *   • null (no cookie) — the DEFAULT ENTRY ("light").
 */
export function themeHtmlAttr(
	pref: ThemePref | null,
): ResolvedTheme | undefined {
	if (pref === null) return DEFAULT_THEME_PREF === "system" ? undefined : DEFAULT_THEME_PREF;
	if (pref === "system") return undefined;
	return pref;
}

/** Client: read the stored preference (localStorage first, cookie fallback). */
export function readStoredThemePref(): ThemePref | null {
	try {
		const stored = normalizeThemePref(localStorage.getItem(THEME_STORAGE_KEY));
		if (stored !== null) return stored;
	} catch {
		/* localStorage unavailable (private mode) — fall through to the cookie. */
	}
	try {
		const match = document.cookie.match(/(?:^|; *)ee-theme=([^;]*)/);
		if (match) return normalizeThemePref(match[1]);
	} catch {
		/* document unavailable — SSR caller misuse; report "nothing stored". */
	}
	return null;
}

/** Client: persist a preference to BOTH stores (localStorage + SSR cookie). */
export function persistThemePref(pref: ThemePref): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, pref);
	} catch {
		/* Best-effort — the cookie below may still succeed. */
	}
	try {
		document.cookie = `${THEME_COOKIE_NAME}=${pref}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
	} catch {
		/* Best-effort — localStorage above may have succeeded. */
	}
}

/** Client: apply a preference to <html> (data-theme + colorScheme), live. */
export function applyThemePref(pref: ThemePref): void {
	const osPrefersDark =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = resolveThemePref(pref, osPrefersDark);
	const root = document.documentElement;
	root.dataset.theme = resolved;
	root.style.colorScheme = resolved;
}

/**
 * No-flash bootstrap — injected render-blocking in <head> by app/layout.tsx so
 * the correct theme is committed to <html data-theme> BEFORE first paint.
 *
 * Mirrors the contract above exactly:
 *   1. localStorage "ee-theme" (authority), else the "ee-theme" cookie
 *      ("auto" normalizes to "system"), else DEFAULT ENTRY: LIGHT.
 *   2. "system" resolves via the OS prefers-color-scheme.
 *   3. When a RECOGNIZED preference exists in either store, both stores are
 *      re-synced (legacy "auto" migrates, missing cookie backfills so SSR is
 *      right on the next load). A first-time visitor — or a store holding an
 *      unrecognized value — writes NOTHING: neither the default nor an unknown
 *      value may be converted into an expressed preference (review 2026-07-22).
 *
 * It also applies the optional accent PALETTE ("ee-palette" -> data-palette)
 * flash-free in the same pass (see styles/palettes.css); "glacier" is the
 * default and needs no attribute.
 *
 * Keep this first in <head> so it stays render-blocking and flash-free.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var ls=null;try{ls=localStorage.getItem('ee-theme');}catch(e){}var ck=null;try{var m=document.cookie.match(/(?:^|; *)ee-theme=([^;]*)/);if(m){ck=m[1];}}catch(e){}var norm=function(v){return v==='light'||v==='dark'||v==='system'?v:v==='auto'?'system':null;};var sp=norm(ls);var cp=norm(ck);var pref=sp||cp||'light';/* DEFAULT ENTRY: light (founder 2026-07-22). Dark/System are opt-in. */var t=pref;if(pref==='system'){var osDark=false;try{osDark=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){}t=osDark?'dark':'light';}d.dataset.theme=t;d.style.colorScheme=t;if(sp!==null||cp!==null){/* sync only a RECOGNIZED preference — never persist the default or an unknown value */try{if(ls!==pref){localStorage.setItem('ee-theme',pref);}}catch(e){}try{if(ck!==pref){document.cookie='ee-theme='+pref+'; path=/; max-age=31536000; samesite=lax';}}catch(e){}}try{var pal=localStorage.getItem('ee-palette');if(pal&&/^[a-z]{2,12}$/.test(pal)&&pal!=='glacier'){d.dataset.palette=pal;}}catch(e){}}catch(e){}})();`;
