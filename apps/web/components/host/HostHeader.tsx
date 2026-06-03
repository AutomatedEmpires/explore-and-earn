import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { HOST_PROFILE, HOST_THREADS } from "./fixtures";
import styles from "./HostHeader.module.css";

/**
 * Host context header (greeting + scope + secondary quick links).
 *
 * Primary scope navigation lives in the host bottom nav (<HostBottomNav>:
 * Dashboard · Listings · Applicants · Messages · Profile). Navigation is scoped
 * per user type (founder canon) — the host lane owns its own bottom nav and does
 * not reuse the generic app-shell tab set. The header carries only secondary
 * quick links (messages, profile).
 */
export function HostHeader() {
  const unreadMessages = HOST_THREADS.filter((thread) => thread.unread).length;

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <span className={styles.greeting}>Hi, {HOST_PROFILE.hostName}</span>
        <span className={styles.scope}>Host · {HOST_PROFILE.orgName}</span>
      </div>
      <nav className={styles.actions} aria-label="Host quick links">
        <Link className={styles.iconLink} href="/host/messages" aria-label="Messages">
          <Icon name="nav.messages" size={20} aria-hidden />
          {unreadMessages > 0 ? (
            <span className={styles.badge}>{unreadMessages}</span>
          ) : null}
        </Link>
        <Link className={styles.iconLink} href="/host/profile" aria-label="Host profile">
          <Icon name="nav.profile" size={20} aria-hidden />
        </Link>
      </nav>
    </header>
  );
}
