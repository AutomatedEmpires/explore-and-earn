import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/primitives.css";
import { AppShell } from "../components/shell";

/**
 * Root document layout.
 *
 * Root owns only global styles and base HTML. Route-scoped chrome lives in the
 * owning layout: seeker routes own seeker header/nav, host routes own host
 * header/nav, and unscoped routes such as /, /search, /listing/[id],
 * marketing/public, and admin render without a global app shell.
 */

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ClerkProvider>
			<html lang="en">
				<body>
					<AppShell>{children}</AppShell>
				</body>
			</html>
		</ClerkProvider>
	);
}
