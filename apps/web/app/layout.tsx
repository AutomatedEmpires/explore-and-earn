import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/primitives.css";
import { AppShell } from "../components/shell";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ClerkProvider>
			<html lang="en">
				<body>
					<Providers>
						<AppShell>{children}</AppShell>
					</Providers>
				</body>
			</html>
		</ClerkProvider>
	);
}
