"use client";

import type { ReactNode } from "react";

import type { AppShellScope } from "./AppHeader";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { ModalHost } from "./ModalHost";
import { OverlayProvider } from "./OverlayProvider";
import { bottomNavByGroup } from "./nav.config";

import "../../styles/shell.css";

// AppShell — the single composition root for every route group's chrome.
// Source of truth: docs/ux/app-shell-and-navigation.md, docs/architecture/frontend-architecture-v1.md.
//
// Each route-group layout renders exactly one <AppShell scope=...>. The shell
// provides: skip-to-content link, sticky header, the main landmark, an optional
// mobile bottom nav (seeker/host), and the overlay host. It contains NO feature
// surfaces, data, auth, or services.

export function AppShell({
	scope,
	children,
}: {
	scope: AppShellScope;
	children: ReactNode;
}): ReactNode {
	const hasBottomNav = Boolean(bottomNavByGroup[scope]);

	return (
		<OverlayProvider>
			<a className="ee-skip-link" href="#main-content">
				Skip to content
			</a>
			<div
				className="ee-app-shell"
				data-shell="app-shell"
				data-scope={scope}
				data-has-bottom-nav={hasBottomNav ? "true" : "false"}
			>
				<AppHeader scope={scope} />
				<main id="main-content" className="ee-app-shell__main" tabIndex={-1}>
					{children}
				</main>
				{hasBottomNav ? <BottomNav scope={scope} /> : null}
			</div>
			<ModalHost />
		</OverlayProvider>
	);
}
