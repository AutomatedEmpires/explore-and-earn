import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { SEEKER_STATUS } from "./fixtures";
import styles from "./SeekerHeader.module.css";

export interface SeekerHeaderProps {
  /**
   * Unread notification count for the badge. Provided by the (seeker) layout,
   * which resolves it from getUnreadNotificationCount for the authed seeker.
   * Defaults to 0 (no badge) when omitted.
   */
  readonly unreadCount?: number;
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
 * This is a pure presentational component: the unread notification count is
 * resolved by the (seeker) layout (a Server Component) and passed in as a prop.
 */
export function SeekerHeader({ unreadCount = 0 }: SeekerHeaderProps) {
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
          aria-label="Notifications"
        >
          <Icon name="system.info" size={20} aria-hidden />
          {unreadCount > 0 ? (
            <span className={styles.badge}>{unreadCount}</span>
          ) : null}
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
