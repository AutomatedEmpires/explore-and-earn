"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "../navigation/BottomNav.module.css";

// The user-scope dock (logged-out / public). Same floating-capsule design as the
// seeker OS dock so the bottom bar never shifts as a visitor crosses into the
// seeker scope. Tabs: Seek · Swipe · Map · Profile · Community.
const TABS: ReadonlyArray<{
	href: string;
	label: string;
	icon: IconKey;
}> = [
	{ href: "/seek", label: "Seek", icon: "nav.seek" },
	{ href: "/swipe", label: "Swipe", icon: "nav.swipe" },
	{ href: "/map", label: "Map", icon: "nav.map" },
	{ href: "/profile", label: "Profile", icon: "nav.profile" },
	{ href: "/community", label: "Community", icon: "nav.feed" },
];

export function PublicBottomNav() {
	const pathname = usePathname();

	return (
		<nav className={styles.nav} aria-label="Primary">
			<ul className={styles.list}>
				{TABS.map((tab) => {
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
