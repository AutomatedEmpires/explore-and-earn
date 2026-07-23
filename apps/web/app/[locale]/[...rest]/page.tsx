import { notFound } from "next/navigation";

/**
 * Locale-scoped catch-all: any unmatched path under a VALID locale segment
 * lands here and is routed to the [locale] not-found boundary, so 404s render
 * with the locale's providers (per next-intl guidance). Explicit routes always
 * win over a catch-all, so this changes nothing for real pages. Unmatched
 * paths whose first segment is not a locale still resolve at the root
 * boundary (app/not-found.tsx).
 */
export default function CatchAllNotFound(): never {
	notFound();
}
