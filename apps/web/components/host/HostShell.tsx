"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { ScopeShellNav, SCOPE_RAIL_WIDTH, type ScopeNavItem } from "../shell";
import { ThemeSwitcher } from "../global/ThemeSwitcher";
import { OnboardingWalkthrough, HOST_TOUR_STEPS } from "../onboarding";
import styles from "./HostShell.module.css";

/**
 * HostShell — the (host) scope chrome.
 *
 * Founder canon (2026-07-13): the host experience is immersive + content-first;
 * secondary navigation is TUCKED, never a row of selectors dumped at the bottom.
 * So the host's sections live in the shared <ScopeShellNav>:
 *   - **≥1024px** → a persistent LEFT rail (content is offset by SCOPE_RAIL_WIDTH).
 *   - **<1024px** → a top-left HAMBURGER that opens a focus-trapped drawer.
 * There is NO mobile bottom dock here (that pattern is reserved for the founder-
 * locked SEEKER dock). The top bar stays minimal: brand + scope + the host's key
 * affordances (new listing, messages, account).
 */

interface NavDef {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly exact?: boolean;
  /** When set, the item shows the live unread-messages count as a badge. */
  readonly badgeKey?: "unread";
}

// Primary sections (rail body / drawer body).
const SECTIONS: readonly NavDef[] = [
  { href: "/host", label: "Overview", icon: "nav.dashboard", exact: true },
  { href: "/host/listings", label: "Listings", icon: "category.mix" },
  { href: "/host/applicants", label: "Applicants", icon: "nav.seekers" },
  { href: "/host/invites", label: "Invites", icon: "action.share" },
  { href: "/host/messages", label: "Messages", icon: "nav.messages", badgeKey: "unread" },
  { href: "/host/announcements", label: "Announcements", icon: "nav.announcements" },
  { href: "/host/assistant", label: "Assistant", icon: "status.match" },
  { href: "/host/analytics", label: "Analytics", icon: "analytics.trend" },
];

// Reference-y links pinned to the rail/drawer footer.
const FOOTER: readonly NavDef[] = [
  { href: "/host/billing", label: "Billing", icon: "benefit.pay" },
  { href: "/host/settings", label: "Settings", icon: "nav.settings" },
  { href: "/host/help", label: "Help", icon: "nav.help" },
];

export interface HostShellProps {
  readonly companyName: string | null;
  readonly photoUrl?: string | null;
  readonly tier?: string | null;
  readonly unread?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, def: NavDef): boolean {
  return def.exact
    ? pathname === def.href
    : pathname === def.href || pathname.startsWith(`${def.href}/`);
}

export function HostShell({ companyName, photoUrl, unread = 0, children }: HostShellProps) {
  const pathname = usePathname();

  const toItem = (def: NavDef): ScopeNavItem => ({
    href: def.href,
    label: def.label,
    icon: def.icon,
    active: isActive(pathname, def),
    badge: def.badgeKey === "unread" && unread > 0 ? unread : undefined,
  });

  const initial = (companyName ?? "H").charAt(0).toUpperCase();
  const avatarStyle: CSSProperties | undefined = photoUrl
    ? { backgroundImage: `url(${photoUrl})` }
    : undefined;

  const brand = (
    <Link href="/host" className={styles.brand} aria-label="Explore & Earn — Host home">
      <span className={styles.brandMark} aria-hidden>E</span>
      <span className={styles.brandWord}>Explore&amp;Earn</span>
    </Link>
  );

  const avatar = (
    <span className={styles.navAvatar} style={avatarStyle} aria-hidden>
      {photoUrl ? null : initial}
    </span>
  );

  return (
    <div
      className={styles.shell}
      style={{ "--host-rail-w": `${SCOPE_RAIL_WIDTH}px` } as CSSProperties}
    >
      <ScopeShellNav
        scopeLabel="Host"
        brand={brand}
        items={SECTIONS.map(toItem)}
        footerItems={FOOTER.map(toItem)}
        userName={companyName ?? "Your farm"}
        userHref="/host/profile"
        avatar={avatar}
        menuLabel="Open host menu"
      />

      <div className={styles.main}>
        <header className={styles.topbar}>
          <Link href="/host" className={styles.topLead} aria-label="Explore & Earn — Host home">
            <span className={styles.topMark} aria-hidden>E</span>
            <span className={styles.topScope}>
              <b>Explore&amp;Earn</b>
              <s>Host</s>
            </span>
          </Link>
          <span className={styles.spacer} />
          <div className={styles.topActions}>
            <ThemeSwitcher />
            <Link className={styles.newBtn} href="/host/listings/new">
              <span aria-hidden>+</span>
              <span className={styles.newLabel}>New listing</span>
            </Link>
            <Link className={styles.bell} href="/host/messages" aria-label="Messages">
              <Icon name="nav.messages" size={20} aria-hidden />
              {unread > 0 ? (
                <span className={styles.bellBadge}>{unread > 99 ? "99+" : unread}</span>
              ) : null}
            </Link>
            <Link className={styles.account} href="/host/profile" aria-label="Account &amp; profile">
              <span className={styles.accountAvatar} style={avatarStyle} aria-hidden>
                {photoUrl ? null : initial}
              </span>
            </Link>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>

      {/* Host onboarding tour — prominent (auto-starts on first visit). */}
      <OnboardingWalkthrough
        storageKey="ee.onboarding.host.v1"
        eyebrow="Host tour"
        title="Welcome — here’s the lay of the land"
        steps={HOST_TOUR_STEPS}
        autoStart
        launcherLabel="Host tour"
      />
    </div>
  );
}
