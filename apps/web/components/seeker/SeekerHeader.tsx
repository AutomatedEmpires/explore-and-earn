import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { SEEKER_STATUS } from "./fixtures";
import { UnreadBadge } from "./UnreadBadge";
import styles from "./SeekerHeader.module.css";

export interface SeekerHeaderProps {
  /**
   * Unread notification count for the badge. Provided by the (seeker) layout,
   * which resolves it from getUnreadNotificationCount for the authed seeker.
   * Defaults to 0 (no badge) when omitted.
   */
  readonly unreadCount?: number;
  /**
   * Authed seeker's Clerk user id, passed to the live <UnreadBadge> so it can
   * subscribe to realtime notification inserts. Omitted when signed out.
   */
  readonly clerkUserId?: string | null;
}

/**
 * Seeker context header (greeting + scope + secondary quick links).
 *
 * Primary scope navigation lives in the locked seeker bottom nav
 * (SeekerBottomNav: Swipe · Map · Seek · Profile). Because that locked four-tab
 * nav has no Home tab, the identity block links back to the seeker command
 * center (/home). The trailing quick links cover notifications and
 * resume/profile only (the Messages stopgap was retired once Messages moved
 * into its own surface).
 *
 * The unread notification count is resolved by the (seeker) layout (a Server
 * Component) and passed in as `initialCount`; the live <UnreadBadge> client
 * child keeps it current via realtime. The badge caps the displayed value at
 * 99+ to stay within the chip.
 */
export function SeekerHeader({ unreadCount = 0, clerkUserId }: SeekerHeaderProps) {
  return (
    <header className={styles.header}>
      <Link className={styles.home} href="/home" aria-label="Seeker home">
        <span className={styles.greeting}>Hi, {SEEKER_STATUS.seekerName}</span>
        <span className={styles.scope}>Seeker</span>
      </Link>
      <nav className={styles.actions} aria-label="Seeker quick links">
        <Link
          className={styles.iconLink}
          href="/notifications"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Icon name="system.info" size={20} aria-hidden />
          <UnreadBadge
            initialCount={unreadCount}
            clerkUserId={clerkUserId}
            className={styles.badge}
          />
        </Link>
        <Link
          className={styles.iconLink}
          href="/resume"
          aria-label="Resume and profile"
        >
          <Icon name="nav.profile" size={20} aria-hidden />
        </Link>
      </nav>
    </header>
  );
}
