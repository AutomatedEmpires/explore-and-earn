"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./PublicBottomNav.module.css";

const TABS: ReadonlyArray<{
	href: string;
	label: string;
	icon: IconKey;
}> = [
	{ href: "/seek", label: "Seek", icon: "nav.seek" },
	{ href: "/map", label: "Map", icon: "nav.map" },
	{ href: "/swipe", label: "Swipe", icon: "nav.swipe" },
	{ href: "/profile", label: "Profile", icon: "nav.profile" },
];

export function PublicBottomNav() {
	const pathname = usePathname();

	return (
		<nav className={styles.nav} aria-label="Public routes">
			{TABS.map((tab) => {
				const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

				return (
					<Link
						key={tab.href}
						className={active ? `${styles.tab} ${styles.active}` : styles.tab}
						href={tab.href}
						aria-current={active ? "page" : undefined}
					>
						<Icon name={tab.icon} size={20} aria-hidden />
						<span>{tab.label}</span>
					</Link>
				);
			})}
		</nav>
	);
}