"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "../navigation/BottomNav.module.css";

// The user-scope dock. Logged-out visitors get the SAME nav as seekers — same
// destinations, same order (matching the seeker OS mobile dock's MOBILE_TABS),
// same floating-capsule design — so the bottom bar never shifts as a visitor
// crosses from a public page into the seeker scope. Locked: Swipe · Map · Seek
// · Profile, with the same icons the seeker dock uses.
const TABS: ReadonlyArray<{
	href: string;
	label: string;
	icon: IconKey;
}> = [
	{ href: "/swipe", label: "Swipe", icon: "category.mix" },
	{ href: "/map", label: "Map", icon: "status.open" },
	{ href: "/seek", label: "Seek", icon: "nav.feed" },
	{ href: "/profile", label: "Profile", icon: "nav.profile" },
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
								<Icon name={tab.icon} size={20} aria-hidden />
								<span className={styles.label}>{tab.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
