"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { ScopeShellNav, type ScopeNavItem } from "../shell";
import { CommandSearch } from "../shared/CommandSearch";

/**
 * Seeker OS shell.
 *
 * Navigation model (founder canon 2026-07-13 — "secondary nav is TUCKED; NEVER
 * a row of selectors at the bottom of the page"):
 *   - PRIMARY modes stay on the founder-locked MOBILE bottom dock:
 *     Swipe · Map · Seek · Profile (that order, mobile only).
 *   - ALL secondary / scope nav lives in the shared <ScopeShellNav>: a persistent
 *     LEFT RAIL at ≥1024px (content offset by the rail width) and a HAMBURGER
 *     drawer at <1024px. The rail also carries the primary destinations because
 *     the mobile dock is hidden on desktop — the rail is the only way to reach
 *     Swipe / Map / Seek there.
 *
 * The shell no longer owns a bespoke sidebar cluster: the personalized,
 * content-first surface is the page itself (SeekerDashboard). The top bar stays
 * minimal — command search + a notifications bell + the profile avatar.
 */

interface SectionDef {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly exact?: boolean;
  readonly badgeKey?: "unread" | "community";
}

// Scope sections — rail body + hamburger drawer. Order = discovery modes first,
// then the pipeline, then the community/journey. Every href resolves to a real
// (seeker) route.
const SECTIONS: readonly SectionDef[] = [
  { href: "/seek", label: "Discover", icon: "nav.seek" },
  { href: "/swipe", label: "Swipe", icon: "nav.swipe" },
  { href: "/map", label: "Map", icon: "nav.map" },
  { href: "/assistant", label: "Assistant", icon: "action.message" },
  { href: "/saved", label: "Saved", icon: "nav.saved" },
  { href: "/applied", label: "Applications", icon: "action.apply" },
  { href: "/invites", label: "Invites", icon: "status.match" },
  { href: "/offered", label: "Offers", icon: "status.offered" },
  { href: "/messages", label: "Messages", icon: "nav.messages", badgeKey: "unread" },
  { href: "/community", label: "Community", icon: "nav.feed", badgeKey: "community" },
  { href: "/journey", label: "Journey", icon: "analytics.meter" },
];

// Reference-y footer — pinned to the bottom of the rail / drawer.
const FOOTER: readonly SectionDef[] = [
  { href: "/notifications", label: "Notifications", icon: "nav.notifications", badgeKey: "unread" },
  { href: "/settings", label: "Settings", icon: "nav.settings" },
  { href: "/help", label: "Help", icon: "nav.help" },
];

// Founder-locked seeker MOBILE dock: Swipe · Map · Seek · Profile (order fixed).
const MOBILE_PRIMARY: readonly { readonly href: string; readonly label: string; readonly icon: IconKey }[] = [
  { href: "/swipe", label: "Swipe", icon: "nav.swipe" },
  { href: "/map", label: "Map", icon: "nav.map" },
  { href: "/seek", label: "Seek", icon: "nav.seek" },
  { href: "/profile", label: "Profile", icon: "nav.profile" },
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
          <span className="seekeros-railbrand">
            <span className="seekeros-railmark" aria-hidden>E</span>
            Explore&amp;Earn
          </span>
        }
      />

      <div className="seekeros-main">
        <header className="seekeros-top">
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
    </div>
  );
}
