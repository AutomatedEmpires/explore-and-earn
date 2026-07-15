import { ClerkProvider } from "@clerk/nextjs";
import { getLocale } from "next-intl/server";
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
		// app/icon.tsx still provides the generated favicon; this adds the
		// PWA/home-screen icons from the Glacier maskable set.
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

/**
 * Viewport + dynamic theme-color (Glacier day/night).
 *
 * `themeColor` declares BOTH themes as a media-keyed pair, so the browser
 * chrome (address bar / status bar / task-switcher) tints ice-white in light
 * and cool-graphite at night — matching the page base tokens in tokens.css
 * (--palette-paper: #EDF2F6 light / #0B141B dark). These metas follow the OS
 * `prefers-color-scheme`, which covers the no-JS/SSR baseline and the common
 * case. NOTE: meta theme-color can only key off the OS media query, not the
 * `data-theme` attribute, so during a clock-driven night override while the OS
 * is in light mode the toolbar tint tracks the OS while page content tracks the
 * clock — an accepted, documented limitation (the no-flash theme-init script
 * that resolves the clock/stored theme is intentionally left untouched).
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
 * No-flash theme init — Glacier day/night.
 *
 * Runs synchronously in <head> BEFORE first paint, so the correct theme is
 * committed to <html data-theme> with zero flash. Resolution order:
 *   1. an EXPLICIT stored preference ("ee-theme" = "dark" | "light"), else
 *   2. "auto" (explicitly stored) — by local clock (dark 20:00–06:00, matches
 *      Sweepza), falling back to the OS prefers-color-scheme in daytime, else
 *   3. DEFAULT ENTRY (nothing stored) — DARK (founder 2026-07; Light/Auto are
 *      opt-in via the Appearance control).
 *
 * It also applies the optional accent PALETTE ("ee-palette" -> data-palette)
 * flash-free in the same pass (see styles/palettes.css); "glacier" is the
 * default and needs no attribute.
 *
 * The Appearance control in seeker Settings (AppearanceControl.tsx) writes the
 * "ee-theme" key with one of "auto" | "dark" | "light" and applies the same
 * resolution live; this script is the flash-free bootstrap of that same logic.
 *
 * Contract for later waves (e.g. i18n):
 *   • The theme lives ONLY in the `data-theme` attribute on <html>
 *     ("dark" | "light"). tokens.css keys off :root[data-theme="dark"]
 *     and @media (prefers-color-scheme: dark):root:not([data-theme="light"]).
 *   • localStorage key is "ee-theme" — persisted as "auto" | "dark" | "light".
 *     A runtime toggle writes that key and sets
 *     document.documentElement.dataset.theme + .style.colorScheme. "auto" (and
 *     any unrecognized/absent value) resolves via the clock/OS fallback above.
 *   • Integrate locale logic ALONGSIDE this script; do not remove it. Keep it
 *     first in <head> so it stays render-blocking and flash-free.
 */
const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var p=null;try{p=localStorage.getItem('ee-theme');}catch(e){}var t;if(p==='dark'||p==='light'){t=p;}else if(p==='auto'){/* explicit auto -> clock (dark 20:00-06:00) + OS fallback */var h=new Date().getHours();var night=h>=20||h<6;var osDark=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches;t=(night||osDark)?'dark':'light';}else{/* DEFAULT ENTRY: dark (founder 2026-07). Light/Auto are opt-in. */t='dark';}d.dataset.theme=t;d.style.colorScheme=t;try{var pal=localStorage.getItem('ee-palette');if(pal&&/^[a-z]{2,12}$/.test(pal)&&pal!=='glacier'){d.dataset.palette=pal;}}catch(e){}}catch(e){}})();`;

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
						<PwaProvider />
					</Providers>
					{isDevBenchEnabled() && <DevBenchToolbar />}
				</body>
			</html>
		</AuthBoundary>
	);
}
