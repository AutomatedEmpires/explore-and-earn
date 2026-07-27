"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DEMO_SURFACES } from "./enterpriseDemo";
import styles from "./demoChrome.module.css";

/**
 * Demo workspace tabs.
 *
 * Real links to real routes, not a tab widget: every surface is separately
 * addressable, shareable, and reachable with the keyboard for free. The active
 * tab is derived from the pathname (locale-prefixed or not) and marked with
 * aria-current so it is announced, not only coloured.
 */
export function DemoWorkspaceNav() {
  const pathname = usePathname() ?? "";

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
        {DEMO_SURFACES.map((surface) => {
          const active = isActive(surface.href);
          return (
            <Link
              key={surface.id}
              href={surface.href}
              className={`${styles.navLink}${active ? ` ${styles.navLinkActive}` : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {surface.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
