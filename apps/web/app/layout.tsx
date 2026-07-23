import { ClerkProvider } from "@clerk/nextjs";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { Patrick_Hand, Cabin_Sketch, Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../styles/tokens.css";
import "../styles/palettes.css";
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
import { PwaProvider } from "../components/pwa/PwaProvider";
import { isDevBenchEnabled } from "../lib/devBench";
import {
	THEME_COOKIE_NAME,
	THEME_INIT_SCRIPT,
	normalizeThemePref,
	themeHtmlAttr,
	type ThemePref,
} from "../lib/theme";
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
	applicationName: "Explore & Earn",
	// app/manifest.ts is auto-served at /manifest.webmanifest; declare it
	// explicitly so the <link rel="manifest"> is emitted for installability.
	manifest: "/manifest.webmanifest",
	// iOS/iPadOS installability + status-bar treatment (no beforeinstallprompt
	// on Safari — this is how "Add to Home Screen" gets a proper standalone app).
	appleWebApp: {
		capable: true,
		title: "Explore & Earn",
		statusBarStyle: "default",
	},
	icons: {
		// app/icon.tsx provides the regular browser icon; the static PNG is the
		// higher-resolution PWA/home-screen treatment.
		icon: [{ url: "/icon", type: "image/png", sizes: "32x32" }],
		apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
	},
	openGraph: {
		siteName: "Explore & Earn",
		type: "website",
	},
	twitter: { card: "summary_large_image" },
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com",
	),
	// NOTE: no `alternates` here on purpose (review 2026-07-22). Next merges
	// metadata per top-level key, so a root-layout `alternates.languages` map
	// pointing at "/" was inherited by EVERY page that declared no alternates —
	// emitting hreflang links that told crawlers each page's en/x-default
	// variant is the homepage. The hreflang scaffold lives in the homepage's
	// own metadata ([locale]/page.tsx); as locales are added, declare per-page
	// alternates in each page's generateMetadata.
};

/**
 * Viewport + dynamic theme-color (Glacier day/night).
 *
 * `themeColor` declares BOTH themes as a media-keyed pair, so the browser
 * chrome (address bar / status bar / task-switcher) tints ice-white in light
 * and cool-graphite at night — matching the page base tokens in tokens.css
 * (--palette-paper: #EDF2F6 light / #0B141B dark). These metas follow the OS
 * `prefers-color-scheme`, which covers the no-JS/SSR baseline and the "System"
 * preference exactly. NOTE: meta theme-color can only key off the OS media
 * query, not the `data-theme` attribute, so a user who FORCES Light/Dark
 * against their OS setting gets a toolbar tint that tracks the OS while page
 * content tracks their choice — an accepted, documented limitation.
 *
 * `viewport-fit: cover` lets the standalone PWA paint under the notch/safe-area
 * insets (the install prompt and offline page respect env(safe-area-inset-*)).
 */
export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	colorScheme: "light dark",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#EDF2F6" },
		{ media: "(prefers-color-scheme: dark)", color: "#0B141B" },
	],
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
 * Theme — Glacier Light/Dark/System.
 *
 * The full contract (values, default, storage, resolution) lives in
 * lib/theme.ts — this layout only renders it:
 *   • SSR reads the "ee-theme" COOKIE and emits the matching <html data-theme>
 *     ("light"/"dark" verbatim; "system" omits the attribute so tokens.css's
 *     @media (prefers-color-scheme: dark) block paints the OS theme with zero
 *     JS; no cookie -> the DEFAULT ENTRY, LIGHT — founder 2026-07-22).
 *   • THEME_INIT_SCRIPT (lib/theme.ts) stays render-blocking first in <head>
 *     as the client authority: it applies localStorage/cookie prefs pre-paint
 *     and keeps both stores in sync. Keep it first so it stays flash-free.
 *
 * The writers are the header ThemeSwitcher (every top bar) and the Appearance
 * control in seeker Settings — both persist localStorage + cookie via
 * lib/theme.ts, so SSR renders the right theme on the next request.
 *
 * Integrate locale logic ALONGSIDE the init script; do not remove it.
 */

export default async function RootLayout({ children }: { children: ReactNode }) {
	// Negotiated by the next-intl middleware and resolved via i18n/request.ts.
	// Drives <html lang>/dir. The theme still lives ONLY in data-theme (below) —
	// locale and theme are independent, per the theme contract.
	const locale = await getLocale();

	// SSR theme from the cookie mirror. Statically prerendered routes (blog is
	// force-static) have no request cookies — degrade to the default; the
	// render-blocking bootstrap still applies any stored preference pre-paint.
	let themePref: ThemePref | null = null;
	try {
		themePref = normalizeThemePref(
			(await cookies()).get(THEME_COOKIE_NAME)?.value,
		);
	} catch {
		/* static prerender — no request scope; render the default entry. */
	}

	return (
		<AuthBoundary>
			<html
				lang={locale}
				dir={dirForLocale(locale)}
				data-theme={themeHtmlAttr(themePref)}
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
						<PwaProvider />
					</Providers>
					{isDevBenchEnabled() && <DevBenchToolbar />}
				</body>
			</html>
		</AuthBoundary>
	);
}
