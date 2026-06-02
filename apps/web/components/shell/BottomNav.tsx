"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";

import { SHELL_NAV_ITEMS } from "./nav-items";
import styles from "./shell.module.css";

/**
 * Fixed bottom navigation. Renders one tab per SHELL_NAV_ITEM using the single
 * icon system (G30). Active state is derived from the current pathname and is
 * never color-only: every tab carries a visible text label.
 */
export function BottomNav() {
	const pathname = usePathname();

	return (
		<nav className={styles.bottomNav} aria-label="Primary">
			<ul className={styles.bottomNavList}>
				{SHELL_NAV_ITEMS.map((item) => {
					const isActive =
						pathname === item.href || pathname.startsWith(`${item.href}/`);

					return (
						<li key={item.key} className={styles.bottomNavItem}>
							<Link
								href={item.href}
								className={styles.bottomNavLink}
								aria-current={isActive ? "page" : undefined}
								data-active={isActive ? "true" : undefined}
							>
								<Icon name={item.icon} size={24} aria-hidden />
								<span className={styles.bottomNavLabel}>{item.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
