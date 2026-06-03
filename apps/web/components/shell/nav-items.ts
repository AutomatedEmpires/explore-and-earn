import type { IconKey } from "@explore-and-earn/ui";

/**
 * A single bottom-navigation destination.
 *
 * `icon` is a canonical key from the frozen packages/ui icon registry, so the
 * single-icon-system guardrail (G30) is satisfied by construction: the union
 * type rejects any glyph that is not part of the registry.
 */
export interface ShellNavItem {
	readonly key: string;
	readonly label: string;
	readonly href: string;
	readonly icon: IconKey;
}

/**
 * Primary navigation destinations, in fixed order (primary discovery actions
 * first, personal surfaces last). Each registry key is used exactly once.
 *
 * Icon mapping rationale:
 * - Discover -> nav.swipe   (the swipe/browse discovery surface)
 * - Search   -> nav.seek    (magnifier == universal search/seek)
 * - Saved    -> nav.saved   (saved listings)
 * - Matches  -> status.match (seeker<->host match surface)
 * - Profile  -> nav.profile (the seeker's own profile)
 *
 * These are presentational defaults for the shell. Per-role nav variants can
 * be layered later by filtering this list; the tab set itself is the locked
 * spec (Discover/Search/Saved/Matches/Profile).
 */
export const SHELL_NAV_ITEMS: readonly ShellNavItem[] = [
	{ key: "discover", label: "Discover", href: "/discover", icon: "nav.swipe" },
	{ key: "search", label: "Search", href: "/search", icon: "nav.seek" },
	{ key: "saved", label: "Saved", href: "/saved", icon: "nav.saved" },
	{ key: "matches", label: "Matches", href: "/matches", icon: "status.match" },
	{ key: "profile", label: "Profile", href: "/profile", icon: "nav.profile" },
];
