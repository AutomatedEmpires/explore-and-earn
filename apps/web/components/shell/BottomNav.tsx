"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isActivePath, type AppShellScope } from "./AppHeader";
import { bottomNavByGroup } from "./nav.config";
import { useOverlay } from "./OverlayProvider";

// BottomNav — mobile-first primary navigation (seeker/host only).
// Source of truth: docs/ux/app-shell-and-navigation.md (Navigation Architecture Doctrine).
//
// LOCKED seeker order (A-FE-SEEKER-NAV-ORDER), each >=44px tap target:
//   Explore -> Saved -> Applications -> Offers -> Profile (Community is NOT here).
// Host order follows Navigation Doctrine: Home / Listings / Applicants / Analytics / More.
//
// Items with an `overlayKey` open an overlay instead of navigating (e.g. host "More").
// The overlay frame is real shell chrome; its menu contents are registered per
// surface in a later Build Pack (see TODO below).

export function BottomNav({ scope }: { scope: AppShellScope }): ReactNode {
	const pathname = usePathname() ?? "/";
	const { open } = useOverlay();
	const items = bottomNavByGroup[scope];

	if (!items || items.length === 0) return null;

	return (
		<nav
			className="ee-bottom-nav"
			data-shell="bottom-nav"
			data-scope={scope}
			aria-label="Primary"
		>
			<ul className="ee-bottom-nav__list">
				{items.map((item) => {
					if (item.overlayKey) {
						const overlayKey = item.overlayKey;
						return (
							<li key={item.key} className="ee-bottom-nav__item">
								<button
									type="button"
									className="ee-bottom-nav__link"
									aria-haspopup="dialog"
									onClick={() =>
										open(overlayKey, ({ close }) => (
											<div className="ee-overlay-panel">
												<header className="ee-overlay-panel__header">
													<h2 className="ee-overlay-panel__title">{item.label}</h2>
													<button
														type="button"
														className="ee-overlay-panel__close"
														onClick={close}
														aria-label="Close"
													>
														Close
													</button>
												</header>
												{/* TODO(frontend): register Host "More" menu items in the host surface Build Pack (WI-FE-06). */}
												<p className="ee-overlay-panel__placeholder">
													Menu items are registered per surface.
												</p>
											</div>
										))
									}
								>
									{item.label}
								</button>
							</li>
						);
					}

					const active = isActivePath(pathname, item.href);
					return (
						<li key={item.key} className="ee-bottom-nav__item">
							<Link
								href={item.href}
								className="ee-bottom-nav__link"
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
	);
}
