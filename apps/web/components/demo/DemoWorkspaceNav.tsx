"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEMO_SURFACES, unreadThreadCount } from "./enterpriseDemo";
import styles from "./demoChrome.module.css";

/**
 * Demo workspace tabs, grouped the way the real host rail is (spec D17):
 * primary work, then the business surfaces, then the previews.
 *
 * Real links to real routes, not a tab widget: every surface is separately
 * addressable, shareable, and reachable with the keyboard for free. The active
 * tab is derived from the pathname (locale-prefixed or not) and marked with
 * aria-current so it is announced, not only coloured.
 */
const GROUP_ORDER = ["primary", "business", "preview"] as const;

export function DemoWorkspaceNav() {
  const pathname = usePathname() ?? "";
  const unread = unreadThreadCount();

  /**
   * The router may prefix a locale segment ("/en/for-hosts/demo"), so the
   * comparison is on the suffix. A suffix match is also exactly what keeps the
   * Overview tab from lighting up on a child route: "/for-hosts/demo/profile"
   * does not end with "/for-hosts/demo".
   */
  function isActive(href: string): boolean {
    return pathname.endsWith(href);
  }

  return (
    <div className={styles.navWrap}>
      <nav className={styles.nav} aria-label="Demo workspace sections">
        {GROUP_ORDER.map((group, groupIndex) => {
          const surfaces = DEMO_SURFACES.filter(
            (surface) => surface.group === group,
          );
          if (surfaces.length === 0) return null;
          return (
            <div key={group} className={styles.navGroup}>
              {groupIndex > 0 ? (
                <span className={styles.navDivider} aria-hidden="true" />
              ) : null}
              {surfaces.map((surface) => {
                const active = isActive(surface.href);
                return (
                  <Link
                    key={surface.id}
                    href={surface.href}
                    className={`${styles.navLink}${active ? ` ${styles.navLinkActive}` : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {surface.label}
                    {surface.id === "messages" && unread > 0 ? (
                      <>
                        <span className={styles.navBadge} aria-hidden="true">
                          {unread}
                        </span>
                        <span className={styles.srOnly}>
                          {unread} unread threads
                        </span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
