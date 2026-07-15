import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, Inter } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/primitives.css";

// Golden Hour Hybrid uses a single editorial display face and one UI face.
const fraunces = Fraunces({
	subsets: ["latin"],
	variable: "--font-fraunces",
	display: "swap",
});

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});
import { CookieBanner } from "../components/CookieBanner";
import { SiteFooter } from "../components/SiteFooter";
import { HideOnHost } from "../components/HideOnHost";
import { SentryUserProvider } from "../components/providers/SentryUserProvider";
import { AppShell } from "../components/shell";
import { DevBenchToolbar } from "../components/dev/DevBenchToolbar";
import { isDevBenchEnabled } from "../lib/devBench";
import { Providers } from "./providers";

/**
 * Root document layout.
 *
 * Root owns only global styles and base HTML. Route-scoped chrome lives in the
 * owning layout: seeker routes own seeker header/nav, host routes own host
 * header/nav, and unscoped routes such as /, /search, /listing/[id],
 * marketing/public, and admin render without a global app shell.
 *
 * The site-wide legal footer and cookie consent banner are mounted here so they
 * appear across every route group.
 */

export const metadata: Metadata = {
	title: { default: "Explore & Earn", template: "%s | Explore & Earn" },
	description:
		"Discover lifestyle work opportunities — housing, meals, and pay included. Farm, maritime, remote, and seasonal.",
	openGraph: {
		siteName: "Explore & Earn",
		type: "website",
	},
	twitter: { card: "summary_large_image" },
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com",
	),
};

function AuthBoundary({ children }: { children: ReactNode }) {
	if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
		return <>{children}</>;
	}

	return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<AuthBoundary>
			<html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
				<body>
					<SentryUserProvider />
					<Providers>
						<AppShell>{children}</AppShell>
						<HideOnHost>
							<SiteFooter />
						</HideOnHost>
						<CookieBanner />
					</Providers>
					{isDevBenchEnabled() && <DevBenchToolbar />}
				</body>
			</html>
		</AuthBoundary>
	);
}
