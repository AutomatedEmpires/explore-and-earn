"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";

import {
  ScopeShellNav,
  SCOPE_RAIL_WIDTH,
  type ScopeNavItem,
  type ScopeNavGroup,
} from "../shell";
import { RolePill } from "../global/RolePill";
import { HostCoachmarks, HOST_COACHMARK_TARGETS } from "./HostCoachmarks";
import { HostActivationBanner } from "./HostActivationBanner";
import { HOST_NAV_GROUPS, type HostNavItem } from "./hostNav";
import styles from "./HostShell.module.css";

/**
 * HostShell — the (host) scope chrome.
 *
 * Founder canon (2026-07-13): the host experience is immersive + content-first;
 * secondary navigation is TUCKED, never a row of selectors dumped at the bottom.
 * So the host's sections live in the shared <ScopeShellNav>:
 *   - **≥1024px** → a persistent LEFT rail (content is offset by SCOPE_RAIL_WIDTH).
 *   - **<1024px** → a top-left HAMBURGER that opens a focus-trapped drawer.
 * There is NO mobile bottom dock here (that pattern is reserved for the founder-
 * locked SEEKER dock).
 *
 * D17 (redesign V2) does two things to this shell:
 *
 * 1. THE TOP BAR REDUCES. It now carries only what the rail cannot: the create
 *    action, messages, and the account. The theme switcher left entirely —
 *    appearance is a preference, and preferences live in Settings, not in the
 *    bar a host looks at while working. (It survives in seeker Settings →
 *    Appearance, which is now its single home across the product.)
 *
 * 2. THE RAIL GROUPS. Ten flat items gave "Billing" the same visual weight as
 *    "Applicants". They now cluster by what a host is doing:
 *      Primary  — the recruiting loop, in the order the work happens
 *      Business — the company and the money
 *      Support  — help getting it done
 *
 * NOT SHIPPED HERE, deliberately: a workspace search box. There is no host-side
 * query surface to submit to yet, and a search field that goes nowhere is worse
 * than no search field. It belongs with the workspace rebuild.
 *
 * D19 (redesign V2) removes the third thing this shell used to mount: an
 * `OnboardingWalkthrough` with `autoStart`. A host's first view of their own
 * workspace was a `role="dialog"` with `aria-modal="true"`, a scrim, a focus
 * trap, a scroll lock, and `aria-hidden` on every sibling of <body> — three
 * abstract steps describing a product the dialog was covering. It is replaced
 * by <HostCoachmarks>: two or three non-modal marks anchored to real controls,
 * dismissible, persisted, and replayable from Help. The seeker shell keeps its
 * own copy for now; that one is Phase G's to remove.
 */

type NavDef = HostNavItem;

export interface HostShellProps {
  readonly companyName: string | null;
  readonly photoUrl?: string | null;
  readonly tier?: string | null;
  /**
   * The host's billing state, from hostAccountState() in @explore-and-earn/db.
   *
   * NOT derived from `tier` here, and the difference matters: 'none' cannot tell
   * a host who never subscribed apart from one whose card is failing, and those
   * two are owed opposite sentences. The layout resolves it from the
   * subscription authority and passes the answer down.
   *
   * `null` means the authority could not be consulted. Nothing is shown in that
   * case — an activation banner in front of a paying host is worse than a
   * missing one in front of a prospect.
   */
  readonly accountState?: string | null;
  readonly unread?: number;
  readonly children: ReactNode;
}

function isActive(pathname: string, def: NavDef): boolean {
  return def.exact
    ? pathname === def.href
    : pathname === def.href || pathname.startsWith(`${def.href}/`);
}

export function HostShell({
  companyName,
  photoUrl,
  accountState,
  unread = 0,
  children,
}: HostShellProps) {
  const pathname = usePathname();

  const toItem = (def: NavDef): ScopeNavItem => ({
    href: def.href,
    label: def.label,
    icon: def.icon,
    active: isActive(pathname, def),
    badge: def.badgeKey === "unread" && unread > 0 ? unread : undefined,
  });

  const navGroups: ScopeNavGroup[] = HOST_NAV_GROUPS.map((group) => ({
    heading: group.heading,
    items: group.items.map(toItem),
  }));

  const initial = (companyName ?? "H").charAt(0).toUpperCase();
  const avatarStyle: CSSProperties | undefined = photoUrl
    ? { backgroundImage: `url(${photoUrl})` }
    : undefined;

  const brand = (
    <Link href="/host" className={styles.brand} aria-label="Explore & Earn — Host home">
      <span className={styles.brandMark} aria-hidden>E</span>
      <span className={styles.brandWord}>Explore&amp;Earn</span>
    </Link>
  );

  const avatar = (
    <span className={styles.navAvatar} style={avatarStyle} aria-hidden>
      {photoUrl ? null : initial}
    </span>
  );

  return (
    <div
      className={styles.shell}
      style={{ "--host-rail-w": `${SCOPE_RAIL_WIDTH}px` } as CSSProperties}
    >
      <ScopeShellNav
        scopeLabel="Host"
        brand={brand}
        groups={navGroups}
        userName={companyName ?? "Your farm"}
        userHref="/host/profile"
        avatar={avatar}
        menuLabel="Open host menu"
        railId={HOST_COACHMARK_TARGETS.rail}
      />

      <div className={styles.main}>
        <header className={styles.topbar}>
          <Link href="/host" className={styles.topLead} aria-label="Explore & Earn — Host home">
            <span className={styles.topMark} aria-hidden>E</span>
            <span className={styles.topScope}>
              <b>Explore&amp;Earn</b>
            </span>
          </Link>
          <RolePill role="host" />
          <span className={styles.spacer} />
          <div className={styles.topActions}>
            <Link
              className={styles.newBtn}
              href="/host/listings/new"
              id={HOST_COACHMARK_TARGETS.create}
            >
              <span aria-hidden>+</span>
              <span className={styles.newLabel}>Create listing</span>
            </Link>
            <Link className={styles.bell} href="/host/messages" aria-label="Messages">
              <Icon name="nav.messages" size={20} aria-hidden />
              {unread > 0 ? (
                <span className={styles.bellBadge}>{unread > 99 ? "99+" : unread}</span>
              ) : null}
            </Link>
            <Link className={styles.account} href="/host/profile" aria-label="Account &amp; profile">
              <span className={styles.accountAvatar} style={avatarStyle} aria-hidden>
                {photoUrl ? null : initial}
              </span>
            </Link>
          </div>
        </header>
        {/* Between the bar and the content on purpose: in the reading order a
            host meets it once, above their work, and it scrolls away. */}
        <HostActivationBanner
          accountState={accountState}
          id={HOST_COACHMARK_TARGETS.activation}
        />
        <div className={styles.content}>{children}</div>
      </div>

      {/*
        D19: anchored, dismissible, persisted — never a blocking modal.
        The activation stop is offered only to a PROSPECT, the only state the
        banner renders for. Even then the banner may be dismissed for the
        session, so the coachmark also skips a stop whose target never appears —
        a mark pointing at nothing is a tour of a page the host cannot see.
      */}
      <HostCoachmarks showActivationStop={accountState === "prospect"} />
    </div>
  );
}
