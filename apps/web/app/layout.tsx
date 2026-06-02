import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/primitives.css";
import { AppShell } from "../components/shell";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<AppShell>{children}</AppShell>
			</body>
		</html>
	);
}
