import { StatusCard } from "../components/StatusCard";

/**
 * ROOT not-found boundary — the page every unmatched URL on the live domain
 * resolves to (mistyped links, stale bookmarks, expired shares, crawler
 * probes). Without this file Next.js renders its unbranded framework 404:
 * the nested [locale]/not-found boundaries only catch explicit notFound()
 * throws from within their own segment, and an invalid locale segment throws
 * from the [locale] LAYOUT, which escalates here (review 2026-07-22).
 *
 * StatusCard is client-side and intl-free on purpose — this boundary renders
 * inside the root layout (theme + fonts present) but outside the [locale]
 * provider, so it must not call useTranslations.
 */
export default function RootNotFound() {
	return <StatusCard type="404" />;
}
