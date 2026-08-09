"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { ScopeShellNav, type ScopeNavItem } from "../shell";
import { CommandSearch } from "../shared/CommandSearch";
import { RolePill } from "../global/RolePill";
import { SeekerCoachmarks } from "./SeekerCoachmarks";
import { signInHref } from "../../lib/authRedirect";

/**
 * Seeker OS shell.
 *
 * Navigation model:
 *   - PRIMARY destinations sit on the MOBILE bottom dock (mobile only).
 *   - ALL secondary / scope nav lives in the shared <ScopeShellNav>: a persistent
 *     LEFT RAIL at ≥1024px (content offset by the rail width) and a HAMBURGER
 *     drawer at <1024px. The rail also carries the primary destinations because
 *     the mobile dock is hidden on desktop.
 *
 * ── FOUNDER-LOCKED MOBILE DOCK (2026-08-04) ─────────────────────────────────
 *
 * The dock is Seek · Swipe · Map · Profile, in that exact order. These are the
 * four primary discovery/account modes a seeker needs on every mobile route.
 * Saved and Applications remain available in the rail/drawer as lifecycle
 * destinations; do not add them to, or reorder, the pinned dock.
 *
 * ── THE BLOCKING TOUR IS GONE (D19) ────────────────────────────────────────
 *
 * This shell used to render <OnboardingWalkthrough>: an `aria-modal="true"`
 * card with a scrim, a focus trap, a scroll lock, and every sibling of the panel
 * set aria-hidden. It described the product while making the product unusable.
 * It is replaced by <SeekerCoachmarks> — three non-modal marks anchored to real
 * controls, with persisted progress. OnboardingWalkthrough itself stays in the
 * tree; the host shell still uses it and that surface is not this phase's.
 */

interface SectionDef {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly exact?: boolean;
  readonly badgeKey?: "messages" | "notifications" | "community";
  /** Present in the desktop rail but hidden from the mobile drawer (already on
   *  the founder-locked bottom dock — the drawer must not repeat it). */
  readonly hideInDrawer?: boolean;
}

// Scope sections — rail body + hamburger drawer. Order = home, then discovery
// modes, then the pipeline, then the community/journey. Every href resolves to a
// real (seeker) route.
//
// `hideInDrawer` marks a destination the mobile DOCK already carries, so the
// drawer does not repeat it.
const SECTIONS: readonly SectionDef[] = [
  { href: "/home", label: "Home", icon: "nav.dashboard", exact: true },
  { href: "/seek", label: "Seek", icon: "nav.seek", hideInDrawer: true },
  { href: "/swipe", label: "Swipe", icon: "nav.swipe", hideInDrawer: true },
  { href: "/map", label: "Map", icon: "nav.map", hideInDrawer: true },
  { href: "/assistant", label: "Assistant", icon: "action.message" },
  { href: "/resume", label: "Résumé", icon: "profile.resume" },
  { href: "/saved", label: "Saved", icon: "nav.saved" },
  { href: "/applied", label: "Applications", icon: "action.apply" },
  { href: "/invites", label: "Invites", icon: "status.match" },
  { href: "/offered", label: "Offers", icon: "status.offered" },
  { href: "/messages", label: "Messages", icon: "nav.messages", badgeKey: "messages" },
  { href: "/community", label: "Community", icon: "nav.feed", badgeKey: "community" },
  { href: "/journey", label: "Journey", icon: "analytics.meter" },
  { href: "/badges", label: "Badges", icon: "status.featured" },
];

// Reference-y footer — pinned to the bottom of the rail / drawer.
const FOOTER: readonly SectionDef[] = [
  { href: "/notifications", label: "Notifications", icon: "nav.notifications", badgeKey: "notifications" },
  { href: "/settings", label: "Settings", icon: "nav.settings" },
  { href: "/help", label: "Help", icon: "nav.help" },
];

/**
 * Founder-locked seeker MOBILE dock: Seek · Swipe · Map · Profile.
 */
const MOBILE_PRIMARY: readonly {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  /** DOM id, so a coachmark can anchor to the real control. */
  readonly id?: string;
}[] = [
  { href: "/seek", label: "Seek", icon: "nav.seek" },
  { href: "/swipe", label: "Swipe", icon: "nav.swipe" },
  { href: "/map", label: "Map", icon: "nav.map" },
  { href: "/profile", label: "Profile", icon: "nav.profile", id: "seeker-nav-profile" },
];

const PUBLIC_SEEKER_DESTINATIONS = new Set(["/seek", "/swipe", "/map"]);

/**
 * Resolve shell navigation without letting guest chrome imply account access.
 * Explicit demo mappings always win and stay inside the isolated walkthrough.
 */
export function resolveSeekerShellHref(
  href: string,
  isAuthenticated: boolean,
  routeMap: Readonly<Record<string, string>> = {},
  demoMode = false,
): string {
  const mappedHref = routeMap[href];
  if (mappedHref !== undefined) return mappedHref;
  if (
    isAuthenticated ||
    demoMode ||
    PUBLIC_SEEKER_DESTINATIONS.has(href)
  ) {
    return href;
  }
  return signInHref("seeker", href);
}

export interface SeekerShellProps {
  /** Actual Clerk session state. Omitted callers are treated as signed out. */
  readonly isAuthenticated?: boolean;
  readonly seekerName: string | null;
  readonly photoUrl?: string | null;
  readonly profileScore?: number;
  /** Legacy shared unread count; specific counts below take precedence. */
  readonly unread?: number;
  /** Message-specific unread count. Falls back to `unread` for older callers. */
  readonly unreadMessages?: number;
  /** Notification-specific unread count. Falls back to `unread` for older callers. */
  readonly unreadNotifications?: number;
  readonly unreadCommunity?: number;
  /** Canonical destination -> isolated demo destination. */
  readonly routeMap?: Readonly<Record<string, string>>;
  /** Demo chrome never mounts persisted account coachmarks. */
  readonly demoMode?: boolean;
  readonly children: ReactNode;
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function SeekerShell({
  isAuthenticated = false,
  seekerName,
  unread = 0,
  unreadMessages = unread,
  unreadNotifications = unread,
  unreadCommunity = 0,
  routeMap = {},
  demoMode = false,
  children,
}: SeekerShellProps) {
  const pathname = usePathname();
  const hasAuthenticatedChrome = isAuthenticated || demoMode;
  const name = seekerName?.trim() || "Explorer";
  const initial = name.charAt(0).toUpperCase();
  const hrefFor = (href: string): string =>
    resolveSeekerShellHref(href, isAuthenticated, routeMap, demoMode);

  const badgeFor = (badgeKey?: SectionDef["badgeKey"]): number | undefined => {
    if (badgeKey === "messages") return unreadMessages > 0 ? unreadMessages : undefined;
    if (badgeKey === "notifications") return unreadNotifications > 0 ? unreadNotifications : undefined;
    if (badgeKey === "community") return unreadCommunity > 0 ? unreadCommunity : undefined;
    return undefined;
  };

  const toNavItem = (def: SectionDef): ScopeNavItem => {
    const href = hrefFor(def.href);
    return {
      href,
      label: def.label,
      icon: def.icon,
      badge: badgeFor(def.badgeKey),
      active: isActive(pathname, href, def.exact),
      hideInDrawer: def.hideInDrawer,
    };
  };

  const items = SECTIONS.map(toNavItem);
  const footerItems = FOOTER.map(toNavItem);

  return (
    <div
      className="seekeros-shell"
      data-seeker-shell
      data-authenticated={hasAuthenticatedChrome ? "true" : "false"}
      data-coachmarks={!demoMode && isAuthenticated ? "true" : "false"}
    >
      {/* Secondary / scope nav — left rail ≥1024px, hamburger drawer <1024px. */}
      <ScopeShellNav
        scopeLabel="Seeker"
        menuLabel="Open Seeker menu"
        items={items}
        footerItems={footerItems}
        userName={hasAuthenticatedChrome ? name : undefined}
        userHref={hasAuthenticatedChrome ? hrefFor("/profile") : undefined}
        avatar={
          hasAuthenticatedChrome ? (
            <span className="seekeros-railava">{initial}</span>
          ) : undefined
        }
        brand={
          <Link
            className="seekeros-railbrand"
            href={hasAuthenticatedChrome ? hrefFor("/home") : "/"}
            aria-label={
              hasAuthenticatedChrome
                ? "Explore & Earn — Seeker home"
                : "Explore & Earn home"
            }
          >
            <span className="seekeros-railmark" aria-hidden>E</span>
            Explore&amp;Earn
          </Link>
        }
      />

      <div className="seekeros-main">
        <header className="seekeros-top">
          {/* D17 — role pill leads the bar; the rail carries the wordmark at
              desktop width. Theme switcher removed: Settings → Appearance is
              the single home for it now. */}
          <div className="seekeros-role">
            <RolePill
              role="seeker"
              isAuthenticated={hasAuthenticatedChrome}
            />
          </div>
          <CommandSearch
            className="seekeros-search"
            action={hrefFor("/seek")}
            placeholder="Search"
            ariaLabel="Search opportunities, places, hosts…"
          />
          <Link
            className="seekeros-tact seekeros-tact--icon ui-pressable"
            href={hrefFor("/notifications")}
            aria-label={
              hasAuthenticatedChrome
                ? "Notifications"
                : "Sign in to view notifications"
            }
          >
            <Icon name="nav.notifications" size={20} aria-hidden />
            {unreadNotifications > 0 ? <span className="seekeros-bdg--top">{unreadNotifications}</span> : null}
          </Link>
          <Link
            className="seekeros-account ui-pressable"
            href={hrefFor("/profile")}
            data-account-state={hasAuthenticatedChrome ? "authenticated" : "guest"}
            aria-label={
              hasAuthenticatedChrome
                ? "Your profile"
                : "Sign in to view your profile"
            }
          >
            {hasAuthenticatedChrome ? (
              <span className="seekeros-avatarmini">{initial}</span>
            ) : (
              <Icon name="nav.profile" size={20} aria-hidden />
            )}
          </Link>
        </header>
        <main className="seekeros-contentwrap">{children}</main>
      </div>

      {/* Founder-locked mobile bottom dock (hidden ≥1024px). */}
      <nav className="seekeros-mnav" aria-label="Seeker">
        {MOBILE_PRIMARY.map((item) => {
          const href = hrefFor(item.href);
          const active = isActive(pathname, href);
          return (
            <Link
              key={item.href}
              id={item.id}
              href={href}
              className="seekeros-mtab ui-pressable"
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} size={20} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* D19 — anchored, non-blocking, persisted. Replaces the modal tour. */}
      {demoMode || !isAuthenticated ? null : <SeekerCoachmarks />}
    </div>
  );
}
