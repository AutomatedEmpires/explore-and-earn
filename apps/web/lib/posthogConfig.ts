export interface PostHogConfig {
	readonly key: string;
	readonly host: string;
}

const POSTHOG_PUBLIC_KEY = /^phc_[A-Za-z0-9_-]{20,}$/;
const PRINTABLE_ASCII_WITHOUT_SPACES = /^[\x21-\x7e]+$/;

/**
 * Fail closed when deployment tooling injects malformed analytics values.
 *
 * Public analytics values are compiled into the browser bundle, so accepting a
 * formatted CLI table (or another multiline value) can turn the entire table
 * into a script URL. Keep validation intentionally small and provider-agnostic:
 * PostHog project keys use the public `phc_` form and API hosts must be clean
 * HTTPS URLs, including when a first-party reverse proxy is used.
 */
export function resolvePostHogConfig(
	key: string | undefined,
	host: string | undefined,
): PostHogConfig | null {
	if (!key || !host) return null;
	if (key !== key.trim() || host !== host.trim()) return null;
	if (!POSTHOG_PUBLIC_KEY.test(key)) return null;
	if (!PRINTABLE_ASCII_WITHOUT_SPACES.test(host)) return null;

	let url: URL;
	try {
		url = new URL(host);
	} catch {
		return null;
	}

	if (
		url.protocol !== "https:" ||
		!url.hostname ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		return null;
	}

	return {
		key,
		host: host.replace(/\/+$/, ""),
	};
}
