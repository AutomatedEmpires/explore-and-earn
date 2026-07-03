"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";

import { UnreadBadge } from "../seeker/UnreadBadge";
import styles from "./GlobalHeader.module.css";

const IMMERSIVE_ROUTES = ["/map", "/swipe"];

function PinMark() {
  return (
    <svg
      width="36"
      height="42"
      viewBox="0 0 36 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 1.5C9.99 1.5 3.5 8 3.5 16c0 5.36 2.88 10.06 7.16 12.7L18 40.5l7.34-11.8C29.62 26.06 32.5 21.36 32.5 16 32.5 8 26.01 1.5 18 1.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <line x1="8" y1="21" x2="28" y2="21" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.3" />
      <path d="M8.5 21L13.5 13l4 5 3.5-6.5L28 21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
      <path d="M15 12.5a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.48" />
      <circle cx="18" cy="40" r="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export interface GlobalHeaderProps {
  readonly scope?: "seeker" | "host" | "guest";
  readonly isAuthenticated?: boolean;
  readonly unreadCount?: number;
  readonly clerkUserId?: string | null;
  readonly userName?: string | null;
  /** Unread community activity count — shows a dot on the Feed tab when > 0. */
  readonly unreadCommunity?: number;
}

export function GlobalHeader({
  scope = "guest",
  isAuthenticated = false,
  unreadCount = 0,
  clerkUserId,
  userName,
  unreadCommunity = 0,
}: GlobalHeaderProps) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const prevY = useRef(0);

  // Smart hide-on-scroll: disappears when scrolling down past header height,
  // reappears the moment the user scrolls back up.
  useEffect(() => {
    let rafId: ReturnType<typeof requestAnimationFrame>;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > prevY.current + 6 && y > 64) {
          setHidden(true);
        } else if (y < prevY.current - 4) {
          setHidden(false);
        }
        prevY.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const isImmersive = IMMERSIVE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  if (isImmersive) return null;

  const communityTab =
    pathname.startsWith("/community/photos") ? "photos" :
    pathname.startsWith("/community/announcements") ? "announcements" :
    pathname === "/community" ? "feed" :
    null;
  const onCommunity = communityTab !== null;
  const scopeLabel = onCommunity ? "Community" : scope === "host" ? "Host" : scope === "seeker" ? "Seeker" : null;
  const homeHref = scope === "host" ? "/host/listings" : "/";
  // Seekers' "Explore" should open the discovery feed, not the marketing root.
  const exploreHref = scope === "seeker" ? "/seek" : homeHref;
  // Active section for the explore/community nav: Community anywhere under
  // /community, Explore on the scope's own home/seek route.
  const sectionActive: "explore" | "community" | null =
    pathname.startsWith("/community") ? "community" :
    pathname === exploreHref ? "explore" :
    null;
  const profileHref = scope === "host" ? "/host/profile" : "/profile";
  const userInitial = userName?.trim().charAt(0).toUpperCase() ?? (scopeLabel?.charAt(0) ?? "E");

  return (
    <header className={`${styles.header}${hidden ? ` ${styles.headerHidden}` : ""}`}>
      <div className={styles.inner}>
        {/* ── Col 1: brand + scope badge ──────────────────────────────── */}
        <div className={styles.brandGroup}>
          <Link className={styles.brand} href={homeHref} aria-label="Explore and Earn — home">
            <span className={styles.pinMark}><PinMark /></span>
            <span className={styles.wordmark}>
              Explore<span className={styles.wordmarkAmp}>&amp;</span>Earn
            </span>
          </Link>
          {scopeLabel ? (
            <span className={styles.scopeBadge} aria-label={`Current scope: ${scopeLabel}`}>
              {scopeLabel}
            </span>
          ) : null}
        </div>

        {/* ── Col 2: nav — community tabs or explore/community links ───── */}
        {onCommunity ? (
          <nav className={styles.communityTabs} aria-label="Community sections">
            <Link
              className={`${styles.communityTab}${communityTab === "feed" ? ` ${styles.communityTabActive}` : ""}`}
              href="/community"
              aria-current={communityTab === "feed" ? "page" : undefined}
            >
              <Icon name="nav.feed" size={16} aria-hidden />
              Feed
              {unreadCommunity > 0 && communityTab !== "feed" ? (
                <span
                  className={styles.communityTabDot}
                  aria-label={`${unreadCommunity} unread`}
                />
              ) : null}
            </Link>
            <Link
              className={`${styles.communityTab}${communityTab === "photos" ? ` ${styles.communityTabActive}` : ""}`}
              href="/community/photos"
              aria-current={communityTab === "photos" ? "page" : undefined}
            >
              <Icon name="nav.photos" size={16} aria-hidden />
              Photos
            </Link>
            <Link
              className={`${styles.communityTab}${communityTab === "announcements" ? ` ${styles.communityTabActive}` : ""}`}
              href="/community/announcements"
              aria-current={communityTab === "announcements" ? "page" : undefined}
            >
              <Icon name="nav.announcements" size={16} aria-hidden />
              Announcements
            </Link>
          </nav>
        ) : (
          <nav className={styles.sectionNav} aria-label="Primary sections">
            <Link
              className={`${styles.navLink}${sectionActive === "explore" ? ` ${styles.navLinkActive}` : ""}`}
              href={exploreHref}
              aria-current={sectionActive === "explore" ? "page" : undefined}
            >
              Explore
            </Link>
            <Link
              className={`${styles.navLink}${sectionActive === "community" ? ` ${styles.navLinkActive}` : ""}`}
              href="/community"
              aria-current={sectionActive === "community" ? "page" : undefined}
            >
              Community
            </Link>
          </nav>
        )}

        {/* ── Col 3: auth ──────────────────────────────────────────────── */}
        <div className={styles.authArea}>
          {isAuthenticated ? (
            <>
              <Link
                className={styles.iconBtn}
                href="/notifications"
                aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications"}
              >
                <Icon name="action.message" size={20} aria-hidden />
                {unreadCount > 0 && (
                  <UnreadBadge
                    initialCount={unreadCount}
                    clerkUserId={clerkUserId ?? undefined}
                    className={styles.badge}
                  />
                )}
              </Link>
              <Link className={styles.avatarBtn} href={profileHref} aria-label="Your profile">
                <span className={styles.avatarInitial} aria-hidden>{userInitial}</span>
                <Icon name="action.more" size={16} aria-hidden />
              </Link>
            </>
          ) : (
            <Link className={styles.signInBtn} href="/sign-in">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
