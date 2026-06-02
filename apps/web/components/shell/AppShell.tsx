import type { ReactNode } from "react";

import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";
import styles from "./shell.module.css";

export interface AppShellProps {
	readonly children: ReactNode;
}

/**
 * Root application chrome.
 *
 * Provides the stable layout regions every route mounts into:
 * - TopBar  (brand)
 * - content (scrollable main region — `{children}`)
 * - BottomNav (primary navigation)
 *
 * Mobile-first, flat/borders-first (no shadows), safe-area aware. Feature
 * lanes render their routes into the content region; they should not need to
 * reimplement chrome.
 */
export function AppShell({ children }: AppShellProps) {
	return (
		<div className={styles.shell}>
			<TopBar />
			<main className={styles.content}>{children}</main>
			<BottomNav />
		</div>
	);
}
