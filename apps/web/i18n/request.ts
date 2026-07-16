import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Per-request i18n config, loaded by the next-intl plugin (see next.config.ts).
 *
 * Resolves the active locale for the request — negotiated by the middleware and
 * exposed via the [locale] segment — then loads that locale's message catalog
 * from messages/<locale>.json. Falls back to the default locale for anything
 * unrecognized so a bad prefix can never leave the tree message-less.
 */
export default getRequestConfig(async ({ requestLocale }) => {
	const requested = await requestLocale;
	const locale = hasLocale(routing.locales, requested)
		? requested
		: routing.defaultLocale;

	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	};
});
