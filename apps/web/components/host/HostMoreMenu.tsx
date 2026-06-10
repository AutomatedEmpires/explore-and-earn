"use client";

import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import { PopupShell } from "../overlay/PopupShell";
import styles from "./HostMoreMenu.module.css";

export interface HostMoreMenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface MenuLink {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly description: string;
}

interface MenuGroup {
  readonly heading: string;
  readonly links: readonly MenuLink[];
}

const MENU_GROUPS: readonly MenuGroup[] = [
  {
    heading: "Manage",
    links: [
      {
        href: "/host/listings",
        label: "Listings",
        icon: "category.mix",
        description: "Your active and draft listings",
      },
      {
        href: "/host/applicants",
        label: "Applicants",
        icon: "status.match",
        description: "Review and manage applicants",
      },
      {
        href: "/host/invites",
        label: "Invites",
        icon: "action.share",
        description: "Track invites you've sent",
      },
    ],
  },
  {
    heading: "Connect",
    links: [
      {
        href: "/host/messages",
        label: "Messages",
        icon: "action.message",
        description: "Your message threads",
      },
      {
        href: "/host/profile",
        label: "Profile",
        icon: "nav.profile",
        description: "Your public host profile",
      },
    ],
  },
  {
    heading: "Insights & settings",
    links: [
      {
        href: "/host/analytics",
        label: "Analytics",
        icon: "analytics.meter",
        description: "Applications, invites, and performance",
      },
      {
        href: "/host/settings",
        label: "Settings",
        icon: "action.filter",
        description: "Plan, team, billing, and account",
      },
    ],
  },
];

export function HostMoreMenu({ open, onClose }: HostMoreMenuProps) {
  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title="Dashboard"
      size="compact"
    >
      <nav className={styles.nav} aria-label="Dashboard sections">
        {MENU_GROUPS.map((group) => (
          <div key={group.heading} className={styles.group}>
            <p className={styles.groupHeading}>{group.heading}</p>
            <ul className={styles.links} role="list">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    className={styles.link}
                    href={link.href}
                    onClick={onClose}
                  >
                    <span className={styles.linkIcon}>
                      <Icon name={link.icon} size={20} aria-hidden />
                    </span>
                    <span className={styles.linkText}>
                      <span className={styles.linkLabel}>{link.label}</span>
                      <span className={styles.linkDesc}>{link.description}</span>
                    </span>
                    <Icon name="action.forward" size={16} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </PopupShell>
  );
}
