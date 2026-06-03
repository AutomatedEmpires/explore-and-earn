"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./HostBottomNav.module.css";

interface HostTab {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  /** Root tab: match exactly so it is not active on every nested route. */
  readonly exact?: boolean;
}

/**
 * Host-scope bottom navigation: Dashboard · Listings · Applicants · Messages ·
 * Profile.
 *
 * Navigation is scoped per user type (founder canon, locked 2026-06-02): there
 * is no single global bottom nav, and each scope owns and wires its own nav.
 * This is the HOST scope's nav, wired inside the (host) route group — it does
 * NOT reuse or extend the app-shell SHELL_NAV_ITEMS, nor the locked seeker nav.
 * Active state is conveyed by aria-current + font weight (never color alone),
 * and every tab carries a permanent text label.
 */
const HOST_TABS: readonly HostTab[] = [
  { href: "/host", label: "Dashboard", icon: "nav.dashboard", exact: true },
  { href: "/host/listings", label: "Listings", icon: "category.mix" },
  { href: "/host/applicants", label: "Applicants", icon: "status.match" },
  { href: "/host/messages", label: "Messages", icon: "nav.messages" },
  { href: "/host/profile", label: "Profile", icon: "nav.profile" },
];

export function HostBottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Host">
      <ul className={styles.list}>
        {HOST_TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className={styles.item}>
              <Link
                className={active ? `${styles.tab} ${styles.active}` : styles.tab}
                href={tab.href}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={tab.icon} size={24} aria-hidden />
                <span className={styles.label}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
