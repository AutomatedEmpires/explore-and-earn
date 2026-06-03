import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { SEEKER_STATUS } from "./fixtures";
import styles from "./SeekerHeader.module.css";

/**
 * Seeker context header (greeting + scope + secondary quick links).
 *
 * Primary scope navigation lives in the locked seeker bottom nav
 * (<SeekerBottomNav>: Swipe · Map · Seek · Profile). The header intentionally
 * carries only secondary quick links (notifications, resume/profile).
 */
export function SeekerHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <span className={styles.greeting}>Hi, {SEEKER_STATUS.seekerName}</span>
        <span className={styles.scope}>Seeker</span>
      </div>
      <nav className={styles.actions} aria-label="Seeker quick links">
        <Link className={styles.iconLink} href="/notifications" aria-label="Notifications">
          <Icon name="system.info" size={20} aria-hidden />
          {SEEKER_STATUS.unreadNotifications > 0 ? (
            <span className={styles.badge}>{SEEKER_STATUS.unreadNotifications}</span>
          ) : null}
        </Link>
        <Link className={styles.iconLink} href="/resume" aria-label="Resume and profile">
          <Icon name="nav.profile" size={20} aria-hidden />
        </Link>
      </nav>
    </header>
  );
}
