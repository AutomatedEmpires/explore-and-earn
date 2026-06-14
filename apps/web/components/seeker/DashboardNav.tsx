"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";

import { Icon } from "@explore-and-earn/ui";
import styles from "./DashboardNav.module.css";

export interface DashboardNavProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly seekerName: string;
  readonly avatarUrl?: string | null;
  readonly unreadCount?: number;
}

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  readonly badge?: number;
}

interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "My Journey",
    items: [
      { href: "/seek", label: "Home", icon: "action.forward" },
      { href: "/saved", label: "Saved", icon: "action.save" },
      { href: "/applied", label: "Applied", icon: "action.apply" },
      { href: "/invites", label: "Invites", icon: "action.message" },
      { href: "/offered", label: "Offers", icon: "action.more" },
    ],
  },
  {
    title: "My Profile",
    items: [
      { href: "/profile", label: "Profile", icon: "action.more" },
      { href: "/resume", label: "Resume", icon: "action.more" },
      { href: "/schedule", label: "Schedule", icon: "action.more" },
      { href: "/travel", label: "Travel Plans", icon: "action.more" },
    ],
  },
  {
    title: "Discover",
    items: [
      { href: "/map", label: "Adventure Map", icon: "action.more" },
      { href: "/swipe", label: "Quick Swipe", icon: "action.more" },
      { href: "/community", label: "Community", icon: "action.more" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: "action.more" },
      { href: "/help", label: "Help", icon: "action.more" },
    ],
  },
];

export function DashboardNav({ open, onClose, seekerName, avatarUrl, unreadCount = 0 }: DashboardNavProps) {
  const pathname = usePathname();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  const initials = seekerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <nav
        className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}
        aria-label="Dashboard navigation"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.identity}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className={styles.identityAvatar} />
            ) : (
              <div className={styles.identityInitials}>{initials}</div>
            )}
            <div className={styles.identityInfo}>
              <span className={styles.identityName}>{seekerName}</span>
              <span className={styles.identityRole}>Seeker</span>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close navigation"
            type="button"
          >
            <Icon name="action.close" size={20} />
          </button>
        </div>

        {/* Sections */}
        <div className={styles.sections}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className={styles.section}>
              <span className={styles.sectionTitle}>{section.title}</span>
              <ul className={styles.sectionList} role="list">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  const badge =
                    item.label === "Invites" && unreadCount > 0
                      ? unreadCount
                      : undefined;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon name={item.icon as Parameters<typeof Icon>[0]["name"]} size={20} />
                        <span className={styles.navLabel}>{item.label}</span>
                        {badge != null && badge > 0 && (
                          <span className={styles.navBadge}>{badge > 99 ? "99+" : badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.drawerFooter}>
          <span className={styles.footerBrand}>Explore&Earn</span>
        </div>
      </nav>
    </>
  );
}
