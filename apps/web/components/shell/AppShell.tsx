import type { ReactNode } from "react";

import "./shell.css";

export interface AppShellProps {
	readonly children: ReactNode;
}

/**
 * Root application chrome — structural frame only.
 *
 * Provides the `shell-frame` container that every route group mounts into.
 * Header and bottom navigation are **not** rendered here; each route-group
 * layout owns and renders its own chrome (founder canon, locked 2026-06-02:
 * "Explore&Earn — Build Pipeline (Active)" — per-scope nav, no global bottom
 * nav).
 *
 * Mobile-first, flat/borders-first (no shadows), safe-area aware.
 */
export function AppShell({ children }: AppShellProps) {
	return <div className="shell-frame">{children}</div>;
}
