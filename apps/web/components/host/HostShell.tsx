"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { CommandSearch } from "../shared/CommandSearch";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly sub: string;
  readonly icon: IconKey;
  readonly exact?: boolean;
  readonly badgeKey?: "unread";
}
interface NavGroup {
  readonly group: string;
  readonly items: readonly NavItem[];
}

const NAV: readonly NavGroup[] = [
  {
    group: "Command",
    items: [
      { href: "/host", label: "Overview", sub: "Command center", icon: "status.open", exact: true },
      { href: "/host/listings", label: "Listings", sub: "Posts + boosts", icon: "category.mix" },
      { href: "/host/applicants", label: "Applicants", sub: "Pipeline", icon: "status.match" },
      { href: "/host/invites", label: "Invites", sub: "Recruiting", icon: "action.forward" },
      { href: "/host/messages", label: "Messages", sub: "Threads", icon: "nav.messages", badgeKey: "unread" },
    ],
  },
  {
    group: "Insights",
    items: [
      { href: "/host/profile", label: "Profile", sub: "Public page", icon: "nav.profile" },
      { href: "/host/analytics", label: "Analytics", sub: "Performance", icon: "analytics.meter" },
      { href: "/host/settings", label: "Settings", sub: "Plan + team", icon: "system.info" },
    ],
  },
];

// Mobile bottom-nav: four primary destinations + a "More" drawer for the rest.
const MOBILE_PRIMARY: readonly NavItem[] = [
  NAV[0].items[0], // Overview
  NAV[0].items[1], // Listings
  NAV[0].items[2], // Applicants
  NAV[0].items[4], // Messages
];

export interface HostShellProps {
  readonly companyName: string | null;
  readonly photoUrl?: string | null;
  readonly tier?: string | null;
  readonly unread?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function HostShell({ companyName, photoUrl, tier, unread = 0, children }: HostShellProps) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const badge = (item: NavItem) => (item.badgeKey === "unread" && unread > 0 ? unread : null);

  const navItem = (item: NavItem) => {
    const active = isActive(pathname, item);
    const b = badge(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className="hostos-navitem"
        aria-current={active ? "page" : undefined}
        onClick={() => setDrawer(false)}
      >
        <span className="i"><Icon name={item.icon} size={20} aria-hidden /></span>
        <span><b>{item.label}</b><s>{item.sub}</s></span>
        {b ? <span className="hostos-bdg">{b}</span> : <span />}
      </Link>
    );
  };

  return (
    <div className="hostos-shell">
      <aside className="hostos-side">
        <div className="hostos-brand">
          <div className="hostos-mark">E</div>
          <div>
            <b>Explore&amp;Earn</b>
            <i><span className="hostos-livedot" /> Host OS</i>
          </div>
        </div>
        <div
          className="hostos-hostcard"
          style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : { background: "var(--gradient-category-farm, linear-gradient(135deg,#2A1608,#CC9440))" }}
        >
          {tier ? <span className="hostos-chip">{tier} Host</span> : null}
          <b>{companyName ?? "Your farm"}</b>
        </div>
        {NAV.map((g) => (
          <nav key={g.group} className="hostos-nav" aria-label={g.group}>
            <div className="hostos-navlabel">{g.group}</div>
            {g.items.map(navItem)}
          </nav>
        ))}
        <Link className="hostos-foot" href="/host/settings" aria-label="Plan and billing">
          <span className="hostos-foot__row">
            <span className="hostos-foot__label">Current plan</span>
            <span className="hostos-foot__tier">{tier ?? "Starter"}</span>
          </span>
          <span className="hostos-foot__cta">
            Manage plan &amp; boosts
            <Icon name="action.forward" size={16} aria-hidden />
          </span>
        </Link>
      </aside>

      <div className="hostos-main">
        <header className="hostos-top">
          <CommandSearch
            className="hostos-search"
            action="/host/listings"
            placeholder="Search applicants, listings, messages…"
          />
          <Link className="hostos-tact hostos-tact--msg" href="/host/messages" aria-label="Messages">
            <Icon name="nav.messages" size={20} aria-hidden />
            {unread > 0 ? <span className="hostos-bdg">{unread}</span> : null}
          </Link>
          <Link className="hostos-tact hostos-tact--p" href="/host/listings/new" aria-label="New listing">
            <span aria-hidden>+</span>
            <span className="hostos-tlabel">New listing</span>
          </Link>
          <Link className="hostos-account" href="/host/settings" aria-label="Account &amp; settings" title="Account &amp; settings">
            <span className="hostos-avatar">{(companyName ?? "H").charAt(0).toUpperCase()}</span>
          </Link>
        </header>
        <div className="hostos-contentwrap">{children}</div>
      </div>

      {/* mobile bottom nav + drawer */}
      <nav className="hostos-mnav" aria-label="Host">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActive(pathname, item);
          const b = badge(item);
          return (
            <Link key={item.href} href={item.href} className="hostos-mtab" aria-current={active ? "page" : undefined}>
              <Icon name={item.icon} size={20} aria-hidden />
              {item.label}{b ? ` (${b})` : ""}
            </Link>
          );
        })}
        <button type="button" className="hostos-mtab" onClick={() => setDrawer(true)} aria-label="More sections">
          <Icon name="action.more" size={20} aria-hidden />More
        </button>
      </nav>
      <div className={`hostos-drawer${drawer ? " open" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
        <div className="hostos-drawerpanel">
          {[NAV[0].items[3], ...NAV[1].items].map(navItem)}
        </div>
      </div>
    </div>
  );
}
