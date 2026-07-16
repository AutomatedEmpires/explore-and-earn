import "server-only"

import { createTranslator } from "next-intl"

import type { NotificationIntent } from "@explore-and-earn/contracts"

import { routing } from "../../i18n/routing"

// Locale-aware rendering for notifications delivered OUTSIDE a request
// (dispatcher/cron context, where useTranslations/getTranslations don't
// exist). All copy lives in messages/<locale>.json under "Notifications.*" —
// intents carry only keys + primitive values, never rendered strings.

type Messages = Record<string, unknown>

const messagesCache = new Map<string, Messages | null>()

async function loadMessages(locale: string): Promise<Messages | null> {
	const cached = messagesCache.get(locale)
	if (cached !== undefined) return cached
	// Only catalog locales are loadable — anything else falls back to default.
	if (!(routing.locales as readonly string[]).includes(locale)) {
		messagesCache.set(locale, null)
		return null
	}
	try {
		const mod = (await import(`../../messages/${locale}.json`)) as { default: Messages }
		messagesCache.set(locale, mod.default)
		return mod.default
	} catch {
		messagesCache.set(locale, null)
		return null
	}
}

/** Walk a dot-path into the nested catalog; undefined when absent. */
function catalogEntry(messages: Messages, key: string): unknown {
	let node: unknown = messages
	for (const part of key.split(".")) {
		if (typeof node !== "object" || node === null) return undefined
		node = (node as Record<string, unknown>)[part]
	}
	return node
}

async function translate(
	locale: string,
	key: string,
	values: Readonly<Record<string, string | number>>,
): Promise<string | null> {
	const messages = await loadMessages(locale)
	if (!messages) return null
	// next-intl returns the KEY for missing entries instead of throwing —
	// check catalog presence explicitly so the fallback chain actually engages.
	if (typeof catalogEntry(messages, key) !== "string") return null
	try {
		const t = createTranslator({ locale, messages: messages as never })
		return t(key as never, values as never)
	} catch {
		return null
	}
}

export interface RenderedNotification {
	readonly title: string
	readonly body: string
	readonly locale: string
}

/**
 * Render an intent's title/body in its locale, falling back to the default
 * locale, then to the raw keys. Never throws and never fabricates copy — a
 * missing catalog entry surfaces as the key string, which tests assert
 * against.
 */
export async function renderNotification(
	intent: Pick<NotificationIntent, "locale" | "titleKey" | "bodyKey" | "values">,
): Promise<RenderedNotification> {
	const locales =
		intent.locale === routing.defaultLocale
			? [intent.locale]
			: [intent.locale, routing.defaultLocale]
	for (const locale of locales) {
		const [title, body] = await Promise.all([
			translate(locale, intent.titleKey, intent.values),
			translate(locale, intent.bodyKey, intent.values),
		])
		if (title !== null && body !== null) return { title, body, locale }
	}
	return { title: intent.titleKey, body: intent.bodyKey, locale: routing.defaultLocale }
}

/**
 * Render one catalog key with locale → default-locale → fallback chain. For
 * channel chrome (email CTA labels, footers, digest subjects) that is not
 * part of an intent's own title/body pair.
 */
export async function renderMessage(
	locale: string,
	key: string,
	values: Readonly<Record<string, string | number>> = {},
	fallback?: string,
): Promise<string> {
	const locales =
		locale === routing.defaultLocale ? [locale] : [locale, routing.defaultLocale]
	for (const candidate of locales) {
		const rendered = await translate(candidate, key, values)
		if (rendered !== null) return rendered
	}
	return fallback ?? key
}

/**
 * True only for safe same-app destinations: rooted, not protocol-relative,
 * no CR/LF splitting, no scheme smuggling. Everything a notification links to
 * must pass this — external URLs are rejected wholesale (no open redirects).
 */
export function isSafeDestinationPath(path: string): boolean {
	if (typeof path !== "string" || path.length === 0 || path.length > 2048) return false
	if (!path.startsWith("/")) return false
	if (path.startsWith("//")) return false
	if (/[\r\n\\]/.test(path)) return false
	if (path.includes("://")) return false
	return true
}

/**
 * Localize an app-relative destination for links rendered outside the app
 * router (emails, push payloads). Mirrors routing localePrefix "as-needed":
 * the default locale is unprefixed; other catalog locales get "/<locale>".
 * Unsafe paths collapse to "/" rather than ever emitting an open redirect.
 */
export function localizedPath(locale: string, path: string): string {
	if (!isSafeDestinationPath(path)) return "/"
	if (locale === routing.defaultLocale) return path
	if (!(routing.locales as readonly string[]).includes(locale)) return path
	return `/${locale}${path === "/" ? "" : path}`
}
