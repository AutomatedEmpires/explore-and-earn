import Link from "next/link";

import { Icon, type IconKey } from "@explore-and-earn/ui";
import type { SeekerStatusSummary } from "./models";
import styles from "./SeekerDirectory.module.css";

interface DirRow {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  /** Optional trailing value (count or percent). */
  readonly meta?: string;
  /** Render the meta as an emphasized pill (e.g. waiting offers / unread). */
  readonly emphasize?: boolean;
}

interface DirGroup {
  readonly title: string;
  readonly rows: readonly DirRow[];
}

export interface SeekerDirectoryProps {
  readonly status: SeekerStatusSummary;
}

function countMeta(value: number): string | undefined {
  return value > 0 ? String(value) : undefined;
}

/**
 * The single seeker directory — one organized way to reach every sub-page.
 * Replaces both the old hamburger drawer and the 12-tile "Manage" grid: one
 * nav, three labelled groups, live counts, real registry icons.
 */
export function SeekerDirectory({ status }: SeekerDirectoryProps) {
  const groups: readonly DirGroup[] = [
    {
      title: "Applications",
      rows: [
        { href: "/saved", label: "Saved", icon: "nav.saved", meta: countMeta(status.savedCount) },
        { href: "/applied", label: "Applied", icon: "action.apply", meta: countMeta(status.appliedCount) },
        {
          href: "/offered",
          label: "Offers",
          icon: "status.match",
          meta: countMeta(status.offersCount),
          emphasize: status.offersCount > 0,
        },
        { href: "/invites", label: "Invites", icon: "action.message" },
        { href: "/accepted", label: "Accepted", icon: "status.accepted" },
        { href: "/not-selected", label: "Past", icon: "status.archived" },
      ],
    },
    {
      title: "Your profile",
      rows: [
        { href: "/profile/edit", label: "Edit profile", icon: "action.edit" },
        { href: "/resume", label: "Resume", icon: "profile.resume", meta: `${status.resumeCompletion}%` },
        { href: "/travel", label: "Travel", icon: "mappin.cluster" },
        { href: "/schedule", label: "Schedule", icon: "status.begins" },
      ],
    },
    {
      title: "Account",
      rows: [
        { href: "/settings", label: "Settings", icon: "nav.settings" },
        {
          href: "/notifications",
          label: "Notifications",
          icon: "nav.notifications",
          meta: countMeta(status.unreadNotifications),
          emphasize: status.unreadNotifications > 0,
        },
        { href: "/help", label: "Help", icon: "nav.help" },
      ],
    },
  ];

  return (
    <nav className={styles.directory} aria-label="Seeker menu">
      {groups.map((group) => (
        <section key={group.title} className={styles.group}>
          <h2 className={styles.groupTitle}>{group.title}</h2>
          <ul className={styles.card}>
            {group.rows.map((row) => (
              <li key={row.href}>
                <Link href={row.href} className={styles.row}>
                  <span className={styles.icon} aria-hidden="true">
                    <Icon name={row.icon} size={20} />
                  </span>
                  <span className={styles.label}>{row.label}</span>
                  {row.meta ? (
                    <span className={row.emphasize ? styles.metaBadge : styles.meta}>
                      {row.meta}
                    </span>
                  ) : null}
                  <span className={styles.chevron} aria-hidden="true">
                    <Icon name="action.forward" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
