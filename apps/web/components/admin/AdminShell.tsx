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
    group: "Moderation",
    items: [
      { href: "/", label: "Overview", sub: "Marketplace health", icon: "analytics.meter", exact: true },
      { href: "/applications", label: "Applications", sub: "Review queue", icon: "action.apply", badgeKey: "unread" },
      { href: "/listings", label: "Listings", sub: "Moderate posts", icon: "category.mix" },
      { href: "/hosts", label: "Hosts", sub: "Verify + trust", icon: "nav.profile" },
    ],
  },
  {
    group: "Tools",
    items: [
      { href: "/admin/email-preview", label: "Email templates", sub: "Transactional", icon: "nav.messages" },
    ],
  },
];

// Admin mobile tabs: Overview · Applications · Listings · Hosts.
const MOBILE_PRIMARY: readonly NavItem[] = [
  { href: "/", label: "Overview", sub: "", icon: "analytics.meter", exact: true },
  { href: "/applications", label: "Queue", sub: "", icon: "action.apply" },
  { href: "/listings", label: "Listings", sub: "", icon: "category.mix" },
  { href: "/hosts", label: "Hosts", sub: "", icon: "nav.profile" },
];

export interface AdminShellProps {
  /** Moderator display name. */
  readonly adminName: string | null;
  /** Pending review-queue count (badge on Applications + topbar). */
  readonly queueCount?: number;
  /** Marketplace-health % for the sidebar meter. */
  readonly healthScore?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminShell({
  adminName,
  queueCount = 0,
  healthScore = 0,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const name = adminName?.trim() || "Moderator";
  const initial = name.charAt(0).toUpperCase();

  const badge = (item: NavItem) => {
    if (item.badgeKey === "unread") return queueCount > 0 ? queueCount : null;
    return null;
  };

  const navItem = (item: NavItem) => {
    const active = isActive(pathname, item);
    const b = badge(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className="adminos-navitem"
        aria-current={active ? "page" : undefined}
      >
        <span className="i"><Icon name={item.icon} size={20} aria-hidden /></span>
        <span><b>{item.label}</b><s>{item.sub}</s></span>
        {b ? <span className="adminos-bdg">{b}</span> : <span />}
      </Link>
    );
  };

  return (
    <div className="adminos-shell">
      <aside className="adminos-side">
        <div className="adminos-brand">
          <div className="adminos-mark">E</div>
          <div>
            <b>Explore&amp;Earn</b>
            <i><span className="adminos-livedot" /> Admin OS</i>
          </div>
        </div>

        <div className="adminos-card">
          <div className="adminos-avatarimg">
            <span className="adminos-avatar">{initial}</span>
            <div>
              <b>{name}</b>
              <span><span className="adminos-livedot" /> Moderation online</span>
            </div>
          </div>
        </div>

        <div className="adminos-score">
          <div className="adminos-score-row">
            <span>Marketplace health</span>
            <span>{healthScore}%</span>
          </div>
          <div className="adminos-meter">
            <span style={{ width: `${Math.max(0, Math.min(100, healthScore))}%` }} />
          </div>
        </div>

        {NAV.map((g) => (
          <nav key={g.group} className="adminos-nav" aria-label={g.group}>
            <div className="adminos-navlabel">{g.group}</div>
            {g.items.map(navItem)}
          </nav>
        ))}
      </aside>

      <div className="adminos-main">
        <header className="adminos-top">
          <div className="adminos-search">⌕&nbsp;&nbsp;Search listings, hosts, applications…</div>
          <Link className="adminos-tact adminos-tact--p" href="/applications" aria-label="Review queue">
            <Icon name="action.apply" size={20} aria-hidden />
            <span className="adminos-tlabel">Review queue</span>
            {queueCount > 0 ? <span className="adminos-bdg--top">{queueCount}</span> : null}
          </Link>
          <Link className="adminos-account" href="/" aria-label="Admin overview">
            <span className="adminos-avatarmini">{initial}</span>
          </Link>
        </header>
        <div className="adminos-contentwrap">{children}</div>
      </div>

      <nav className="adminos-mnav" aria-label="Admin">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link key={item.href} href={item.href} className="adminos-mtab" aria-current={active ? "page" : undefined}>
              <Icon name={item.icon} size={20} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
