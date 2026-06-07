"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./AdminSidebar.module.css";

interface AdminNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
}

const NAV_ITEMS: ReadonlyArray<AdminNavItem> = [
  { href: "/admin", label: "Dashboard", icon: "nav.dashboard" },
  { href: "/admin/listings", label: "Listings", icon: "nav.seek" },
  { href: "/admin/hosts", label: "Hosts", icon: "nav.profile" },
  { href: "/admin/applications", label: "Applications", icon: "action.apply" },
];

/** Left-hand admin navigation with an active-route indicator. */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Admin sections">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.link}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} size={20} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
