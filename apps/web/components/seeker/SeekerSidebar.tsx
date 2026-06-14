"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@explore-and-earn/ui";
import type { SeekerStatusSummary } from "./models";
import styles from "./SeekerSidebar.module.css";

function ResumeRingSmall({ pct }: { pct: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#2D7A3A" : pct >= 40 ? "#C48A18" : "#A05030";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className={styles.resumeRingSmall}>
      <circle cx="12" cy="12" r={r} stroke="rgba(0,0,0,0.1)" strokeWidth="2.5" fill="none" />
      <circle
        cx="12" cy="12" r={r}
        stroke={color} strokeWidth="2.5" fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

interface SidebarNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  readonly badgeKey?: "invites" | "offers" | "saved";
}

const NAV_SECTIONS: ReadonlyArray<{ title: string; items: readonly SidebarNavItem[] }> = [
  {
    title: "My Journey",
    items: [
      { href: "/seek",     label: "Home",    icon: "action.forward"                      },
      { href: "/saved",    label: "Saved",   icon: "action.save",    badgeKey: "saved"   },
      { href: "/applied",  label: "Applied", icon: "action.apply"                        },
      { href: "/invites",  label: "Invites", icon: "action.message", badgeKey: "invites" },
      { href: "/offered",  label: "Offers",  icon: "action.forward", badgeKey: "offers"  },
      { href: "/accepted", label: "Accepted",icon: "action.apply"                        },
    ],
  },
  {
    title: "My Profile",
    items: [
      { href: "/profile",  label: "Profile",  icon: "nav.profile" },
      { href: "/resume",   label: "Resume",   icon: "action.more" },
      { href: "/schedule", label: "Schedule", icon: "action.more" },
      { href: "/travel",   label: "Travel",   icon: "action.more" },
    ],
  },
  {
    title: "Discover",
    items: [
      { href: "/community", label: "Community", icon: "action.more" },
      { href: "/map",       label: "Map",       icon: "action.more" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: "action.more" },
      { href: "/help",     label: "Help",     icon: "action.more" },
    ],
  },
];

export interface SeekerSidebarProps {
  readonly seekerName: string;
  readonly avatarUrl?: string | null;
  readonly status: SeekerStatusSummary;
}

export function SeekerSidebar({ seekerName, avatarUrl, status }: SeekerSidebarProps) {
  const pathname = usePathname();
  const initials =
    seekerName
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SE";

  function getBadge(key?: "invites" | "offers" | "saved"): number {
    if (!key) return 0;
    if (key === "invites") return status.unreadNotifications;
    if (key === "offers") return status.offersCount;
    if (key === "saved") return status.savedCount;
    return 0;
  }

  return (
    <aside className={styles.sidebar} aria-label="Seeker navigation">
      {/* Identity header */}
      <Link href="/profile" className={styles.profileHeader}>
        <div className={styles.avatarWrap}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className={styles.avatar} />
          ) : (
            <div className={styles.avatarFallback}>{initials}</div>
          )}
        </div>
        <div className={styles.profileMeta}>
          <span className={styles.profileName}>{seekerName}</span>
          <span className={styles.profileRole}>
            <span className={styles.profileDot} aria-hidden="true" />
            Seeker
          </span>
        </div>
      </Link>

      {/* Resume progress bar */}
      <Link
        href="/resume"
        className={styles.resumeBar}
        aria-label={`Resume ${status.resumeCompletion}% complete`}
      >
        <ResumeRingSmall pct={status.resumeCompletion} />
        <div className={styles.resumeBarBody}>
          <div className={styles.resumeBarRow}>
            <span className={styles.resumeBarLabel}>Resume</span>
            <span className={styles.resumeBarPct}>{status.resumeCompletion}%</span>
          </div>
          <div className={styles.resumeTrack}>
            <div
              className={styles.resumeFill}
              style={{ width: `${status.resumeCompletion}%` }}
            />
          </div>
        </div>
      </Link>

      {/* Nav sections */}
      <div className={styles.navArea}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className={styles.navSection}>
            <span className={styles.navSectionTitle}>{section.title}</span>
            <ul className={styles.navList} role="list">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const badge = getBadge(item.badgeKey);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className={styles.navIcon} aria-hidden="true">
                        <Icon name={item.icon as Parameters<typeof Icon>[0]["name"]} size={16} />
                      </span>
                      <span className={styles.navLabel}>{item.label}</span>
                      {badge > 0 && (
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

      <div className={styles.sidebarFooter}>
        <span className={styles.brand}>Explore&amp;Earn</span>
      </div>
    </aside>
  );
}
