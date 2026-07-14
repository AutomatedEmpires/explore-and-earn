import { ClerkProvider } from "@clerk/nextjs";
import { getLocale } from "next-intl/server";
import { Patrick_Hand, Cabin_Sketch, Inter } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/primitives.css";

// The locked 3-font stack (visual-system.md §2): Patrick Hand display,
// Inter UI, Cabin Sketch marketing accents. Nothing else ships.
const patrickHand = Patrick_Hand({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-patrick-hand",
	display: "swap",
});

const cabinSketch = Cabin_Sketch({
	weight: ["400", "700"],
	subsets: ["latin"],
	variable: "--font-cabin-sketch",
	display: "swap",
});

const inter = Inter({
	weight: ["400", "500", "600"],
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
	// hreflang scaffold — English only today. As locales are added to
	// i18n/routing.ts, extend this map (and per-page generateMetadata alternates)
	// so crawlers see every localized variant. x-default points at the
	// unprefixed default-locale URL.
	alternates: {
		languages: {
			en: "/",
			"x-default": "/",
		},
	},
};

// BCP-47 codes that render right-to-left. Empty today (en is LTR); listed here
// so <html dir> is correct the moment an RTL locale (ar, he, fa, …) is added to
// i18n/routing.ts — no layout change required.
const RTL_LOCALES = new Set<string>([]);

function dirForLocale(locale: string): "ltr" | "rtl" {
	return RTL_LOCALES.has(locale.split("-")[0]) ? "rtl" : "ltr";
}

function AuthBoundary({ children }: { children: ReactNode }) {
	if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
		return <>{children}</>;
	}

	return <ClerkProvider>{children}</ClerkProvider>;
}

/**
 * No-flash theme init — Glacier day/night.
 *
 * Runs synchronously in <head> BEFORE first paint, so the correct theme is
 * committed to <html data-theme> with zero flash. Resolution order:
 *   1. stored user preference ("ee-theme" = "dark" | "light"), else
 *   2. auto by local clock — dark 20:00–06:00 (matches Sweepza), else
 *   3. during daytime, fall back to the OS prefers-color-scheme.
 *
 * Contract for later waves (e.g. i18n):
 *   • The theme lives ONLY in the `data-theme` attribute on <html>
 *     ("dark" | "light"). tokens.css keys off :root[data-theme="dark"]
 *     and @media (prefers-color-scheme: dark):root:not([data-theme="light"]).
 *   • localStorage key is "ee-theme". A runtime toggle should write that key
 *     and set document.documentElement.dataset.theme + .style.colorScheme.
 *   • Integrate locale logic ALONGSIDE this script; do not remove it. Keep it
 *     first in <head> so it stays render-blocking and flash-free.
 */
const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var p=null;try{p=localStorage.getItem('ee-theme');}catch(e){}var t;if(p==='dark'||p==='light'){t=p;}else{var h=new Date().getHours();var night=h>=20||h<6;var osDark=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches;t=(night||osDark)?'dark':'light';}d.dataset.theme=t;d.style.colorScheme=t;}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
	// Negotiated by the next-intl middleware and resolved via i18n/request.ts.
	// Drives <html lang>/dir. The theme still lives ONLY in data-theme (below) —
	// locale and theme are independent, per the theme-init contract.
	const locale = await getLocale();

	return (
		<AuthBoundary>
			<html
				lang={locale}
				dir={dirForLocale(locale)}
				data-theme="light"
				suppressHydrationWarning
				className={`${patrickHand.variable} ${cabinSketch.variable} ${inter.variable}`}
			>
				<head>
					{/* Render-blocking: commit the Glacier day/night theme before paint. */}
					<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				</head>
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
