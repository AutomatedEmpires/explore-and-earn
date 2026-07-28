"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@explore-and-earn/ui";

import { UnreadBadge } from "../seeker/UnreadBadge";
import { NavMenu, type NavMenuItem } from "./NavMenu";
import { RolePill, type ChromeRole } from "./RolePill";
import styles from "./GlobalHeader.module.css";

const IMMERSIVE_ROUTES = ["/map", "/swipe"];

/**
 * THE TWO DOORS (V2 D18).
 *
 * A signed-out visitor is either looking for work or looking for workers, and
 * the old header made them infer that from a flat Explore/Community/For Hosts
 * row. These are the two sides, each carrying its own destinations.
 *
 * COMMUNITY LIVES IN THE SEEKER MENU, NOT THE TOP LEVEL. It stopped being a
 * public destination in V2 — it is an authenticated seeker space, so a
 * signed-out visitor who picks it is sent to a seeker sign-in that returns them
 * to it. Leaving it in the top bar advertised a room the visitor could not
 * enter, which is the same defect class as a nav item that 404s.
 *
 * PRICING POINTS AT THE PUBLIC PAGE, NOT /host/plans. /host/plans is a private
 * dashboard segment (lib/hostRoutes) — a prospect who clicks "Pricing" there
 * meets a sign-in wall before ever seeing a number, which is precisely the
 * pay-before-you-look funnel D6/D7 removed. /for-hosts#plans publishes the same
 * founder-locked prices and its cards lead into /host/plans for anyone ready to
 * activate.
 */
const SEEKER_MENU: readonly NavMenuItem[] = [
  { href: "/seek", label: "Explore jobs", description: "Browse every open role", icon: "nav.seek" },
  { href: "/swipe", label: "Swipe", description: "One role at a time", icon: "nav.swipe" },
  { href: "/map", label: "Map", description: "Find work by place", icon: "nav.map" },
  { href: "/community", label: "Community", description: "Seeker space — sign in to join", icon: "nav.feed" },
  { href: "/for-seekers#how-it-works", label: "How it works", description: "What a listing promises", icon: "system.info" },
];

const HOST_MENU: readonly NavMenuItem[] = [
  { href: "/for-hosts", label: "Host product", description: "What hiring here looks like", icon: "nav.host" },
  { href: "/for-hosts/demo", label: "Live demo", description: "Walk a real workspace", icon: "action.view" },
  { href: "/for-hosts#plans", label: "Pricing", description: "Three published prices", icon: "benefit.pay" },
  { href: "/for-hosts#profile-title", label: "Employer profiles", description: "One profile, every role", icon: "trust.verified_host" },
  { href: "/for-hosts#faq-title", label: "Host FAQ", description: "Questions hosts ask", icon: "nav.help" },
];

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
  const t = useTranslations("Nav");
  const [hidden, setHidden] = useState(false);
  const prevY = useRef(0);
  // Logged-out sign-in chooser (I'm a seeker · I'm a host · New here).
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const authMenuRef = useRef<HTMLDivElement>(null);

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

  // Close the auth chooser on navigation.
  useEffect(() => {
    setAuthMenuOpen(false);
  }, [pathname]);

  // Dismiss the auth chooser on outside click or Escape while it's open.
  useEffect(() => {
    if (!authMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (authMenuRef.current && !authMenuRef.current.contains(event.target as Node)) {
        setAuthMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAuthMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [authMenuOpen]);

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
  // D17 — the badge beside the wordmark is a ROLE pill now, so it says who you
  // are, not where you are. Two consequences:
  //   * "Community" is gone from it. Community is a place, not a role; an
  //     authenticated seeker reading the feed is still a Seeker, and the nav
  //     already shows which section is active.
  //   * It renders only when SIGNED IN. Signed-out visitors have no role, and a
  //     pill reading "Seeker" over a marketing page was asserting a state the
  //     visitor had not entered.
  const chromeRole: ChromeRole | null =
    scope === "host" ? "host" : scope === "seeker" ? "seeker" : null;
  const homeHref = scope === "host" ? "/host/listings" : "/";
  // Founder canon (2026-07-13): "Explore brings to homepage." The Explore tab is
  // the always-clear way back to the scope's home (the marketing homepage for
  // seekers/guests) — discovery lives on the Seek dock tab, not here.
  const exploreHref = homeHref;
  // Active section for the explore/community/hosts nav: Community anywhere
  // under /community, For Hosts on /for-hosts, Explore on the scope's own
  // home/seek route.
  const sectionActive: "explore" | "community" | "hosts" | null =
    pathname.startsWith("/community") ? "community" :
    pathname === "/for-hosts" || pathname.startsWith("/for-hosts/") ? "hosts" :
    pathname === exploreHref ? "explore" :
    null;
  // Which DOOR the signed-out visitor is standing in. The seeker door owns the
  // discovery surfaces and the gateway; the host door owns /for-hosts.
  const seekerDoorActive =
    pathname === "/for-seekers" ||
    pathname.startsWith("/for-seekers/") ||
    ["/seek", "/swipe", "/map", "/community"].some(
      (r) => pathname === r || pathname.startsWith(`${r}/`),
    );
  const hostDoorActive = sectionActive === "hosts";
  const profileHref = scope === "host" ? "/host/profile" : "/profile";
  const userInitial =
    userName?.trim().charAt(0).toUpperCase() ??
    (chromeRole ? chromeRole.charAt(0).toUpperCase() : "E");

  return (
    <header className={`${styles.header}${hidden ? ` ${styles.headerHidden}` : ""}`}>
      <div className={styles.inner}>
        {/* ── Col 1: brand + scope badge ──────────────────────────────── */}
        <div className={styles.brandGroup}>
          <Link className={styles.brand} href={homeHref} aria-label={t("homeAriaLabel")}>
            <span className={styles.pinMark}><PinMark /></span>
            <span className={styles.wordmark}>
              Explore<span className={styles.wordmarkAmp}>&amp;</span>Earn
            </span>
          </Link>
          {chromeRole ? (
            <RolePill role={chromeRole} tone="onDark" isAuthenticated={isAuthenticated} />
          ) : null}
        </div>

        {/* ── Col 2: nav — community tabs or explore/community links ───── */}
        {onCommunity ? (
          <nav className={styles.communityTabs} aria-label="Community sections">
            {/* Order is founder-locked: Photos | Feed | Announcements (L→R). */}
            <Link
              className={`${styles.communityTab}${communityTab === "photos" ? ` ${styles.communityTabActive}` : ""}`}
              href="/community/photos"
              aria-current={communityTab === "photos" ? "page" : undefined}
            >
              <Icon name="nav.photos" size={16} aria-hidden />
              {t("photos")}
            </Link>
            <Link
              className={`${styles.communityTab}${communityTab === "feed" ? ` ${styles.communityTabActive}` : ""}`}
              href="/community"
              aria-current={communityTab === "feed" ? "page" : undefined}
            >
              <Icon name="nav.feed" size={16} aria-hidden />
              {t("feed")}
              {unreadCommunity > 0 && communityTab !== "feed" ? (
                <span
                  className={styles.communityTabDot}
                  aria-label={`${unreadCommunity} unread`}
                />
              ) : null}
            </Link>
            <Link
              className={`${styles.communityTab}${communityTab === "announcements" ? ` ${styles.communityTabActive}` : ""}`}
              href="/community/announcements"
              aria-current={communityTab === "announcements" ? "page" : undefined}
            >
              <Icon name="nav.announcements" size={16} aria-hidden />
              {t("announcements")}
            </Link>
          </nav>
        ) : isAuthenticated ? (
          /* AUTHENTICATED NAV IS UNCHANGED (D18 changes the signed-out door,
             not the signed-in workspace): a seeker who is already in keeps
             Explore + Community as top-level links, because for them Community
             is a room they can walk into rather than a sign-in prompt. */
          <nav className={styles.sectionNav} aria-label="Primary sections">
            <Link
              className={`${styles.navLink}${sectionActive === "explore" ? ` ${styles.navLinkActive}` : ""}`}
              href={exploreHref}
              aria-current={sectionActive === "explore" ? "page" : undefined}
            >
              {t("explore")}
            </Link>
            <Link
              className={`${styles.navLink}${sectionActive === "community" ? ` ${styles.navLinkActive}` : ""}`}
              href="/community"
              aria-current={sectionActive === "community" ? "page" : undefined}
            >
              {t("community")}
            </Link>
          </nav>
        ) : (
          /* SIGNED OUT — the two doors (D18). Community is inside the seeker
             menu, not out here: it is an authenticated seeker space now, so a
             top-level entry would advertise a room this visitor cannot enter. */
          <nav className={styles.sectionNav} aria-label="Primary sections">
            <NavMenu
              id="seekers"
              label={t("forSeekers")}
              items={SEEKER_MENU}
              active={seekerDoorActive}
            />
            <NavMenu
              id="hosts"
              label={t("forHosts")}
              items={HOST_MENU}
              active={hostDoorActive}
            />
          </nav>
        )}

        {/* ── Col 3: auth ──────────────────────────────────────────────── */}
        {/* The theme switcher left the PUBLIC header (commercial redesign,
            founder 2026-07-27): a marketing surface sells one intentional
            brand, it does not offer to recolor itself. Theme preference
            lives on in seeker Settings → Appearance and in the authenticated
            workspace shells; the Light-default contract in lib/theme.ts is
            unchanged. */}
        <div className={styles.authArea}>
          {isAuthenticated ? (
            <>
              <Link
                className={styles.iconBtn}
                href="/notifications"
                aria-label={unreadCount > 0 ? `${t("notifications")} — ${unreadCount} unread` : t("notifications")}
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
              <Link className={styles.avatarBtn} href={profileHref} aria-label={t("yourProfile")}>
                <span className={styles.avatarInitial} aria-hidden>{userInitial}</span>
                <Icon name="action.more" size={16} aria-hidden />
              </Link>
            </>
          ) : (
            <>
            <div className={styles.authMenuWrap} ref={authMenuRef}>
              <button
                type="button"
                className={styles.signInGhost}
                aria-haspopup="menu"
                aria-expanded={authMenuOpen}
                onClick={() => setAuthMenuOpen((open) => !open)}
              >
                {t("signIn")}
                <Icon name="action.more" size={16} aria-hidden />
              </button>
              {authMenuOpen ? (
                <div className={styles.authMenu} role="menu" aria-label="Sign in options">
                  <p className={styles.authMenuLabel}>{t("chooseYourPath")}</p>
                  <Link className={styles.authMenuItem} role="menuitem" href="/sign-in?role=seeker">
                    <span className={styles.authMenuIcon}>
                      <Icon name="nav.seek" size={18} aria-hidden />
                    </span>
                    <span className={styles.authMenuText}>
                      <span className={styles.authMenuItemTitle}>{t("seekerTitle")}</span>
                      <span className={styles.authMenuItemSub}>{t("seekerSub")}</span>
                    </span>
                    <Icon name="action.forward" size={14} aria-hidden />
                  </Link>
                  <Link className={styles.authMenuItem} role="menuitem" href="/sign-in?role=host">
                    <span className={styles.authMenuIcon}>
                      <Icon name="nav.host" size={18} aria-hidden />
                    </span>
                    <span className={styles.authMenuText}>
                      <span className={styles.authMenuItemTitle}>{t("hostTitle")}</span>
                      <span className={styles.authMenuItemSub}>{t("hostSub")}</span>
                    </span>
                    <Icon name="action.forward" size={14} aria-hidden />
                  </Link>
                  <span className={styles.authMenuDivider} aria-hidden />
                  <Link className={styles.authMenuGhost} role="menuitem" href="/sign-up">
                    {t("createAccount")}
                  </Link>
                  {/* The admin entry left this menu (redesign 2026-07-27):
                      operators reach /sign-in?role=admin directly — a public
                      marketing menu advertising an admin door reads as
                      clutter at best and an attack invitation at worst. */}
                </div>
              ) : null}
            </div>
            {/* The primary signed-out action. "Sign in" is for people who
                already have an account and demoted to a ghost control to say
                so; this is the one filled button in the header, and it goes to
                the account chooser rather than assuming a role for someone who
                has not picked a door yet. */}
            <Link className={styles.signInBtn} href="/sign-up">
              {t("getStarted")}
            </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
