import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "../../i18n/routing";

/**
 * Locale segment layout.
 *
 * Owns i18n context for every page route (all pages live under this segment).
 * The root layout (../layout.tsx) still owns <html>/<body>, the Glacier
 * no-flash theme init, fonts, and Clerk — this layer only threads locale +
 * messages into the tree. NextIntlClientProvider inherits the active locale,
 * messages, and formats from i18n/request.ts, making them available to every
 * Server AND Client component below (the header nav, homepage anthem, apply
 * gate, …) via useTranslations / getTranslations.
 */
export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	// A prefix that isn't a supported locale 404s rather than rendering an
	// untranslated shell. (With localePrefix "as-needed" + a single locale this
	// is defensive, but it's the correct guard as locales are added.)
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}
	// Opt routes under this segment into static rendering where they don't opt
	// out themselves (e.g. force-dynamic on the homepage).
	setRequestLocale(locale);

	return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
