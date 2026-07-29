"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { ScopeShellNav, type ScopeNavItem } from "../shell";
import { CommandSearch } from "../shared/CommandSearch";
import { RolePill } from "../global/RolePill";
import { SeekerCoachmarks } from "./SeekerCoachmarks";

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
 * ── THE DOCK CHANGED IN V2-G, AND IT IS A DELIBERATE OVERRIDE ───────────────
 *
 * The dock was Swipe · Map · Seek · Profile, marked in this file as
 * founder-locked (2026-07-13). D17 supersedes it with Explore · Swipe · Saved ·
 * Applications · Profile, because the old set answered only "how do I look for
 * work" and had no answer at all for "what happened to the things I already
 * did" — Saved and Applications, the two surfaces a returning seeker opens
 * first, were both three taps deep behind a hamburger.
 *
 * MAP DID NOT LOSE ITS PLACE. It moves from a tab to (a) the rail and the mobile
 * drawer — the `hideInDrawer` flag is off for it now, where before the dock's
 * ownership kept it hidden — and (b) an explicit "Map view" control on /seek
 * that carries the current filters across. So the map is one tap from Explore
 * rather than zero, and reachable from the menu on every seeker route.
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
  readonly badgeKey?: "unread" | "community";
  /** Present in the desktop rail but hidden from the mobile drawer (already on
   *  the founder-locked bottom dock — the drawer must not repeat it). */
  readonly hideInDrawer?: boolean;
}

// Scope sections — rail body + hamburger drawer. Order = home, then discovery
// modes, then the pipeline, then the community/journey. Every href resolves to a
// real (seeker) route.
//
// `hideInDrawer` marks a destination the mobile DOCK already carries, so the
// drawer does not repeat it. Map is deliberately NOT flagged: it left the dock
// in V2-G, so the drawer is now its mobile home.
const SECTIONS: readonly SectionDef[] = [
  { href: "/home", label: "Home", icon: "nav.dashboard", exact: true },
  { href: "/seek", label: "Seek", icon: "nav.seek", hideInDrawer: true },
  { href: "/swipe", label: "Swipe", icon: "nav.swipe", hideInDrawer: true },
  { href: "/map", label: "Map", icon: "nav.map" },
  { href: "/assistant", label: "Assistant", icon: "action.message" },
  { href: "/resume", label: "Résumé", icon: "profile.resume" },
  { href: "/saved", label: "Saved", icon: "nav.saved", hideInDrawer: true },
  { href: "/applied", label: "Applications", icon: "action.apply", hideInDrawer: true },
  { href: "/invites", label: "Invites", icon: "status.match" },
  { href: "/offered", label: "Offers", icon: "status.offered" },
  { href: "/messages", label: "Messages", icon: "nav.messages", badgeKey: "unread" },
  { href: "/community", label: "Community", icon: "nav.feed", badgeKey: "community" },
  { href: "/journey", label: "Journey", icon: "analytics.meter" },
  { href: "/badges", label: "Badges", icon: "status.featured" },
];

// Reference-y footer — pinned to the bottom of the rail / drawer.
const FOOTER: readonly SectionDef[] = [
  { href: "/notifications", label: "Notifications", icon: "nav.notifications", badgeKey: "unread" },
  { href: "/settings", label: "Settings", icon: "nav.settings" },
  { href: "/help", label: "Help", icon: "nav.help" },
];

/**
 * Seeker MOBILE dock (D17): Explore · Swipe · Saved · Applications · Profile.
 *
 * Two discovery modes and the two lifecycle buckets a returning seeker actually
 * opens. Map moved to the rail/drawer and to the "Map view" control on /seek —
 * see the file header for why, and what it cost.
 */
const MOBILE_PRIMARY: readonly {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  /** DOM id, so a coachmark can anchor to the real control. */
  readonly id?: string;
}[] = [
  { href: "/seek", label: "Explore", icon: "nav.seek" },
  { href: "/swipe", label: "Swipe", icon: "nav.swipe" },
  { href: "/saved", label: "Saved", icon: "nav.saved" },
  { href: "/applied", label: "Applications", icon: "action.apply" },
  { href: "/profile", label: "Profile", icon: "nav.profile", id: "seeker-nav-profile" },
];

export interface SeekerShellProps {
  readonly seekerName: string | null;
  readonly photoUrl?: string | null;
  readonly profileScore?: number;
  readonly unread?: number;
  readonly unreadCommunity?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function SeekerShell({
  seekerName,
  unread = 0,
  unreadCommunity = 0,
  children,
}: SeekerShellProps) {
  const pathname = usePathname();
  const name = seekerName?.trim() || "Explorer";
  const initial = name.charAt(0).toUpperCase();

  const badgeFor = (badgeKey?: "unread" | "community"): number | undefined => {
    if (badgeKey === "unread") return unread > 0 ? unread : undefined;
    if (badgeKey === "community") return unreadCommunity > 0 ? unreadCommunity : undefined;
    return undefined;
  };

  const toNavItem = (def: SectionDef): ScopeNavItem => ({
    href: def.href,
    label: def.label,
    icon: def.icon,
    badge: badgeFor(def.badgeKey),
    active: isActive(pathname, def.href, def.exact),
    hideInDrawer: def.hideInDrawer,
  });

  const items = SECTIONS.map(toNavItem);
  const footerItems = FOOTER.map(toNavItem);

  return (
    <div className="seekeros-shell">
      {/* Secondary / scope nav — left rail ≥1024px, hamburger drawer <1024px. */}
      <ScopeShellNav
        scopeLabel="Seeker"
        menuLabel="Open Seeker menu"
        items={items}
        footerItems={footerItems}
        userName={name}
        userHref="/profile"
        avatar={<span className="seekeros-railava">{initial}</span>}
        brand={
          <Link className="seekeros-railbrand" href="/" aria-label="Explore & Earn — home">
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
          <RolePill role="seeker" />
          <CommandSearch
            className="seekeros-search"
            action="/seek"
            placeholder="Search opportunities, places, hosts…"
          />
          <Link
            className="seekeros-tact seekeros-tact--icon ui-pressable"
            href="/notifications"
            aria-label="Notifications"
          >
            <Icon name="nav.notifications" size={20} aria-hidden />
            {unread > 0 ? <span className="seekeros-bdg--top">{unread}</span> : null}
          </Link>
          <Link
            className="seekeros-account ui-pressable"
            href="/profile"
            aria-label="Your profile"
          >
            <span className="seekeros-avatarmini">{initial}</span>
          </Link>
        </header>
        <div className="seekeros-contentwrap">{children}</div>
      </div>

      {/* Founder-locked mobile bottom dock (hidden ≥1024px). */}
      <nav className="seekeros-mnav" aria-label="Seeker">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              id={item.id}
              href={item.href}
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
      <SeekerCoachmarks />
    </div>
  );
}
