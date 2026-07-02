"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "../navigation/BottomNav.module.css";

interface SeekerTab {
	readonly href: string;
	readonly label: string;
	readonly icon: IconKey;
}

/**
 * Locked seeker-scope bottom navigation: Seek · Map · Swipe · Profile.
 *
 * Navigation is scoped per user type — there is no single global bottom nav. The
 * seeker lane owns this nav inside the (seeker) route group. The tab set and
 * order are founder-locked: do NOT add, remove, or reorder tabs.
 *
 * Active state is conveyed by aria-current + font weight (never color alone),
 * and every tab carries a permanent text label.
 */
const SEEKER_TABS: readonly SeekerTab[] = [
	{ href: "/seek", label: "Seek", icon: "nav.seek" },
	{ href: "/map", label: "Map", icon: "nav.map" },
	{ href: "/swipe", label: "Swipe", icon: "nav.swipe" },
	{ href: "/profile", label: "Profile", icon: "nav.profile" },
];

export function SeekerBottomNav() {
	const pathname = usePathname();

	return (
		<nav className={styles.nav} aria-label="Seeker">
			<ul className={styles.list}>
				{SEEKER_TABS.map((tab) => {
					const active =
						pathname === tab.href || pathname.startsWith(`${tab.href}/`);
					return (
						<li key={tab.href} className={styles.item}>
							<Link
								className={active ? `${styles.tab} ${styles.active}` : styles.tab}
								href={tab.href}
								aria-current={active ? "page" : undefined}
							>
								<Icon name={tab.icon} size={24} aria-hidden />
								<span className={styles.label}>{tab.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
