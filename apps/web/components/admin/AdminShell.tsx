"use client";

import { type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import {
  ScopeShellNav,
  SCOPE_RAIL_WIDTH,
  type ScopeNavItem,
} from "../shell";
import { CommandSearch } from "../shared/CommandSearch";
import { ThemeSwitcher } from "../global/ThemeSwitcher";

/**
 * Admin OS shell — the moderation command center chrome.
 *
 * Founder canon (2026-07-13): every scope shares ONE navigation model — a
 * persistent LEFT rail at ≥1024px, a top-left HAMBURGER → left drawer below it.
 * "NO row of selectors dumped at the bottom. Never." So Admin drops its old
 * bespoke sidebar + bottom dock and drives its sections through the shared
 * {@link ScopeShellNav}. The content area is the immersive surface: a light
 * command topbar (search + review-queue + at-a-glance health) over the routed
 * moderation surfaces, offset by {@link SCOPE_RAIL_WIDTH} at desktop.
 */

interface AdminNavDef {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  /** Overview matches its href EXACTLY (so /admin/* children don't light it up). */
  readonly exact?: boolean;
  /** Carries the live review-queue count as a badge (Applications only). */
  readonly queueBadge?: boolean;
}

// Primary operational sections — the moderator's working set, ordered by how
// often a queue needs action. Only REAL admin routes (no fabricated sections).
const SECTIONS: readonly AdminNavDef[] = [
  { href: "/admin", label: "Overview", icon: "analytics.meter", exact: true },
  { href: "/applications", label: "Applications", icon: "action.apply", queueBadge: true },
  { href: "/listings", label: "Listings", icon: "category.mix" },
  { href: "/hosts", label: "Hosts", icon: "nav.profile" },
  { href: "/admin/reports", label: "Reports", icon: "action.report" },
  { href: "/admin/claims", label: "Claims", icon: "profile.verification" },
  { href: "/admin/refunds", label: "Refunds", icon: "benefit.pay" },
  { href: "/admin/notifications", label: "Notifications", icon: "nav.notifications" },
];

// Reference-y tools, TUCKED into the pinned rail footer (settings-shaped).
const FOOTER: readonly AdminNavDef[] = [
  // Configuration rather than a queue: the early-host programme is off until a
  // founder sets a capacity and a closing date here.
  { href: "/admin/founding", label: "Early-host programme", icon: "benefit.pay" },
  { href: "/admin/guidelines", label: "Guidelines", icon: "nav.help" },
  { href: "/admin/email-preview", label: "Email templates", icon: "nav.messages" },
];

export interface AdminShellProps {
  /** Moderator display name. */
  readonly adminName: string | null;
  /** Pending review-queue count (badge on Applications + topbar). */
  readonly queueCount?: number;
  /** Marketplace-health % for the topbar at-a-glance meter. */
  readonly healthScore?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, item: AdminNavDef): boolean {
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
  const health = Math.max(0, Math.min(100, Math.round(healthScore)));

  const items: ScopeNavItem[] = SECTIONS.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: isActive(pathname, item),
    badge: item.queueBadge && queueCount > 0 ? queueCount : undefined,
  }));

  const footerItems: ScopeNavItem[] = FOOTER.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: isActive(pathname, item),
  }));

  const brand = (
    <span className="adminos-railbrand">
      <span className="adminos-railmark" aria-hidden="true">E</span>
      <span className="adminos-railword">
        <b>Explore&amp;Earn</b>
        <i><span className="adminos-livedot" /> Admin OS</i>
      </span>
    </span>
  );

  // Keep the desktop content offset synced to the exported rail width instead of
  // a hard-coded magic number (the rail is position:fixed at ≥1024px).
  const mainStyle = {
    "--adminos-rail-w": `${SCOPE_RAIL_WIDTH}px`,
  } as CSSProperties;

  return (
    <>
      <ScopeShellNav
        scopeLabel="Admin"
        brand={brand}
        items={items}
        footerItems={footerItems}
        userName={name}
        userHref="/admin"
        avatar={initial}
        menuLabel="Open admin menu"
      />

      <div className="adminos-main" style={mainStyle}>
        <header className="adminos-top">
          <CommandSearch
            className="adminos-search"
            action="/applications"
            placeholder="Search listings, hosts, applications…"
          />
          <div className="adminos-topmeta">
            <ThemeSwitcher />
            <span
              className="adminos-health"
              role="meter"
              aria-valuenow={health}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Marketplace health"
            >
              <Icon name="analytics.meter" size={16} aria-hidden />
              <span className="adminos-health__v">{health}%</span>
            </span>
            <Link
              className="adminos-tact adminos-tact--p"
              href="/applications"
              aria-label="Review queue"
            >
              <Icon name="action.apply" size={20} aria-hidden />
              <span className="adminos-tlabel">Review queue</span>
              {queueCount > 0 ? (
                <span className="adminos-bdg--top">
                  {queueCount > 99 ? "99+" : queueCount}
                </span>
              ) : null}
            </Link>
          </div>
        </header>
        <div className="adminos-contentwrap">{children}</div>
      </div>
    </>
  );
}
