import Link from "next/link";

import styles from "./ListingSectionNav.module.css";

export interface ListingSectionLink {
  readonly href: `#${string}`;
  readonly label: string;
}

export interface ListingSectionNavProps {
  readonly links: readonly ListingSectionLink[];
}

/**
 * Compact in-page navigation for the long-form listing detail. The page builds
 * the links from sections that have real data, so every destination exists and
 * empty host/location narratives never leave a dead anchor behind.
 */
export function ListingSectionNav({ links }: ListingSectionNavProps) {
  return (
    <nav className={styles.nav} aria-labelledby="listing-sections-label">
      <p className={styles.label} id="listing-sections-label">
        On this page
      </p>
      <ul className={styles.links}>
        {links.map((link) => (
          <li key={link.href}>
            <Link className={styles.link} href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
