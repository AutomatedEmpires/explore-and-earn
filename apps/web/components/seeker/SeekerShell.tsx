"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly sub: string;
  readonly icon: IconKey;
  readonly exact?: boolean;
  readonly badgeKey?: "unread" | "community";
}
interface NavGroup {
  readonly group: string;
  readonly items: readonly NavItem[];
}

const NAV: readonly NavGroup[] = [
  {
    group: "Discover",
    items: [
      { href: "/seek", label: "Discover", sub: "Today's matches", icon: "nav.feed" },
      { href: "/swipe", label: "Swipe", sub: "Quick-decide", icon: "category.mix" },
      { href: "/map", label: "Map", sub: "By place", icon: "status.open" },
      { href: "/saved", label: "Saved", sub: "Your shortlist", icon: "action.forward" },
    ],
  },
  {
    group: "Pipeline",
    items: [
      { href: "/applied", label: "Applications", sub: "Where you stand", icon: "action.apply" },
      { href: "/invites", label: "Invites", sub: "Hosts reaching out", icon: "status.match" },
      { href: "/messages", label: "Messages", sub: "Threads", icon: "nav.messages", badgeKey: "unread" },
    ],
  },
  {
    group: "You",
    items: [
      { href: "/journey", label: "Journey", sub: "Your season", icon: "analytics.meter" },
      { href: "/community", label: "Community", sub: "Field notes", icon: "nav.feed", badgeKey: "community" },
      { href: "/profile", label: "Profile", sub: "Your story", icon: "nav.profile" },
      { href: "/settings", label: "Settings", sub: "Preferences", icon: "system.info" },
    ],
  },
];

// Founder-locked seeker mobile tabs: Swipe · Map · Seek · Profile.
const MOBILE_PRIMARY: readonly NavItem[] = [
  { href: "/swipe", label: "Swipe", sub: "", icon: "category.mix" },
  { href: "/map", label: "Map", sub: "", icon: "status.open" },
  { href: "/seek", label: "Seek", sub: "", icon: "nav.feed" },
  { href: "/profile", label: "Profile", sub: "", icon: "nav.profile" },
];

export interface SeekerShellProps {
  readonly seekerName: string | null;
  readonly photoUrl?: string | null;
  readonly profileScore?: number;
  readonly unread?: number;
  readonly unreadCommunity?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SeekerShell({
  seekerName,
  photoUrl,
  profileScore = 0,
  unread = 0,
  unreadCommunity = 0,
  children,
}: SeekerShellProps) {
  const pathname = usePathname();
  const name = seekerName?.trim() || "Explorer";
  const initial = name.charAt(0).toUpperCase();

  const badge = (item: NavItem) => {
    if (item.badgeKey === "unread") return unread > 0 ? unread : null;
    if (item.badgeKey === "community") return unreadCommunity > 0 ? unreadCommunity : null;
    return null;
  };

  const navItem = (item: NavItem) => {
    const active = isActive(pathname, item);
    const b = badge(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className="seekeros-navitem"
        aria-current={active ? "page" : undefined}
      >
        <span className="i"><Icon name={item.icon} size={20} aria-hidden /></span>
        <span><b>{item.label}</b><s>{item.sub}</s></span>
        {b ? <span className="seekeros-bdg">{b}</span> : <span />}
      </Link>
    );
  };

  return (
    <div className="seekeros-shell">
      <aside className="seekeros-side">
        <div className="seekeros-brand">
          <div className="seekeros-mark">E</div>
          <div>
            <b>Explore&amp;Earn</b>
            <i><span className="seekeros-livedot" /> Seeker OS</i>
          </div>
        </div>

        <div
          className="seekeros-card"
          style={photoUrl ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.04), rgba(0,0,0,.62)), url(${photoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <div className="seekeros-avatarimg">
            <span className="seekeros-avatar">{initial}</span>
            <div>
              <b>{name}</b>
              <span><span className="seekeros-livedot" /> Ready to explore</span>
            </div>
          </div>
        </div>

        <div className="seekeros-score">
          <div className="seekeros-score-row">
            <span>Profile</span>
            <span>{profileScore}%</span>
          </div>
          <div className="seekeros-meter">
            <span style={{ width: `${Math.max(0, Math.min(100, profileScore))}%` }} />
          </div>
        </div>

        {NAV.map((g) => (
          <nav key={g.group} className="seekeros-nav" aria-label={g.group}>
            <div className="seekeros-navlabel">{g.group}</div>
            {g.items.map(navItem)}
          </nav>
        ))}
      </aside>

      <div className="seekeros-main">
        <header className="seekeros-top">
          <div className="seekeros-search">⌕&nbsp;&nbsp;Search opportunities, places, hosts…</div>
          <Link className="seekeros-tact seekeros-tact--icon" href="/notifications" aria-label="Notifications">
            <Icon name="system.info" size={20} aria-hidden />
            {unread > 0 ? <span className="seekeros-bdg--top">{unread}</span> : null}
          </Link>
          <Link className="seekeros-tact seekeros-tact--p" href="/swipe" aria-label="Find work">
            <Icon name="action.forward" size={20} aria-hidden />
            <span className="seekeros-tlabel">Find work</span>
          </Link>
          <Link className="seekeros-account" href="/profile" aria-label="Your profile">
            <span className="seekeros-avatarmini">{initial}</span>
          </Link>
        </header>
        <div className="seekeros-contentwrap">{children}</div>
      </div>

      <nav className="seekeros-mnav" aria-label="Seeker">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link key={item.href} href={item.href} className="seekeros-mtab" aria-current={active ? "page" : undefined}>
              <Icon name={item.icon} size={20} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
