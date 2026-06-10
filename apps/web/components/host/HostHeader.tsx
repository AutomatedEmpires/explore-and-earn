import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import styles from "./HostHeader.module.css";

export interface HostHeaderProps {
  readonly hostName?: string | null;
  readonly orgName?: string | null;
  readonly unreadMessages?: number;
}

/**
 * Host context header (greeting + scope + secondary quick links).
 *
 * Primary scope navigation lives in the host bottom nav (<HostBottomNav>:
 * Dashboard · Listings · Applicants · Messages · Profile). Navigation is scoped
 * per user type (founder canon) — the host lane owns its own bottom nav and does
 * not reuse the generic app-shell tab set. The header carries only secondary
 * quick links (messages, profile).
 */
export function HostHeader({
	hostName,
	orgName,
	unreadMessages = 0,
}: HostHeaderProps) {
  const greeting = hostName?.trim() ? `Hi, ${hostName.trim()}` : "Host dashboard";
  const orgLabel = orgName?.trim() || null;

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <Link className={styles.home} href="/host" aria-label="Explore and Earn host dashboard">
          <span className={styles.brand}>Explore&amp;Earn</span>
          <span className={styles.greeting}>{greeting}</span>
        </Link>
        <span className={styles.scopePill}>Host</span>
        {orgLabel ? <span className={styles.orgChip}>{orgLabel}</span> : null}
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
