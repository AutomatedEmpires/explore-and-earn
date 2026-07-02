"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { HostMoreMenu } from "./HostMoreMenu";
import styles from "../navigation/BottomNav.module.css";

interface HostTab {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly exact?: boolean;
}

const HOST_TABS: readonly HostTab[] = [
  { href: "/host/listings", label: "Listings", icon: "category.mix" },
  { href: "/host/analytics", label: "Analytics", icon: "analytics.meter" },
  { href: "/host/applicants", label: "Applicants", icon: "status.match" },
  { href: "/host/profile", label: "Profile", icon: "nav.profile" },
];

export function HostBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
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
          <li className={styles.item}>
            <button
              type="button"
              className={styles.tab}
              onClick={() => setMoreOpen(true)}
              aria-label="More dashboard sections"
            >
              <Icon name="action.more" size={24} aria-hidden />
              <span className={styles.label}>More</span>
            </button>
          </li>
        </ul>
      </nav>
      <HostMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
