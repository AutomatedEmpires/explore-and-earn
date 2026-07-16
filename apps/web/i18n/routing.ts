import { defineRouting } from "next-intl/routing";

/**
 * Locale routing config — the single source of truth for the i18n pipeline.
 *
 * The middleware, <html lang>/dir, hreflang alternates, and the navigation
 * helpers all read this. To add a locale: append its BCP-47 code to `locales`
 * and drop a matching `messages/<locale>.json` — nothing else needs editing to
 * light up routing.
 */
export const routing = defineRouting({
	// English ships first to prove the pipeline. Structured to grow: e.g. add
	// "es" here + messages/es.json and /es/… routing comes online automatically.
	locales: ["en"],
	defaultLocale: "en",
	// "as-needed": the DEFAULT locale ("en") carries NO path prefix, so every
	// existing English URL keeps resolving unchanged — /seek, /map, /listing/…,
	// /host/… all stay put (no mass 404, no link rewrites this wave). Additional
	// locales get a prefix (/es/seek). English is therefore /seek, NOT /en/seek;
	// next-intl redirects a stray /en/seek → /seek.
	localePrefix: "as-needed",
});

/** Union of the supported BCP-47 locale codes (currently "en"). */
export type AppLocale = (typeof routing.locales)[number];
