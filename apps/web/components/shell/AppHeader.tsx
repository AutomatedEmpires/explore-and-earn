"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { RouteGroup } from "../../lib/routes";
import { headerNavByGroup, type NavItem } from "./nav.config";

// AppHeader — top app-shell chrome (brand + optional top navigation).
// Source of truth: docs/ux/app-shell-and-navigation.md (Notion: Navigation Architecture Doctrine).
//
// SCOPE (WI-FE-01): chrome only. No session/auth reads, no data fetching, no
// notifications, no search. Icons are intentionally omitted: per guardrail G30,
// iconography must come from the packages/ui Streamline registry rather than
// inline SVG, so nav items render accessible text labels until the registry is
// wired in a follow-up.
//
// Top navigation only renders for the marketing/public (logged-out) scopes in
// V1. Seeker/host primary navigation lives in the bottom nav; admin/community/
// demo render a brand-only header.

export type AppShellScope = RouteGroup;

export function isActivePath(pathname: string, href: string): boolean {
	if (href === "/") return pathname === "/";
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({ scope }: { scope: AppShellScope }): ReactNode {
	const pathname = usePathname() ?? "/";
	const items: readonly NavItem[] = headerNavByGroup[scope] ?? [];

	return (
		<header className="ee-app-header" data-shell="app-header" data-scope={scope}>
			<div className="ee-app-header__inner">
				<Link href="/" className="ee-app-header__brand" aria-label="Explore&Earn home">
					Explore&amp;Earn
				</Link>
				{items.length > 0 ? (
					<nav className="ee-app-header__nav" aria-label="Primary">
						<ul className="ee-app-header__list">
							{items.map((item) => {
								const active = isActivePath(pathname, item.href);
								return (
									<li key={item.key} className="ee-app-header__item">
										<Link
											href={item.href}
											className="ee-app-header__link"
											aria-current={active ? "page" : undefined}
											data-active={active ? "true" : undefined}
										>
											{item.label}
										</Link>
									</li>
								);
							})}
						</ul>
					</nav>
				) : null}
			</div>
		</header>
	);
}
