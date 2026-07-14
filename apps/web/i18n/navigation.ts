import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation primitives.
 *
 * Prefer these over `next/link` + `next/navigation` for INTERNAL links so hrefs
 * stay locale-correct as new locales come online. This wave does NOT rewrite the
 * hundreds of existing `next/link` hrefs — the middleware resolves the active
 * locale for unprefixed (English) paths, so they keep working untouched. Reach
 * for these on new links and where locale-correctness matters most.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
	createNavigation(routing);
