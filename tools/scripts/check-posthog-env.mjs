const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const configured = Boolean(key || host);

if (!configured) {
	if (process.env.VERCEL_ENV === "production") {
		console.error(
			"posthog-env: production requires NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST",
		);
		process.exit(1);
	}
	console.log("posthog-env: analytics is not configured in this build lane");
	process.exit(0);
}

const errors = [];
const validKey =
	typeof key === "string" &&
	key === key.trim() &&
	/^phc_[A-Za-z0-9_-]{20,}$/.test(key);

if (!validKey) {
	errors.push(
		"NEXT_PUBLIC_POSTHOG_KEY must be one clean public PostHog project key",
	);
}

let validHost =
	typeof host === "string" &&
	host === host.trim() &&
	/^[\x21-\x7e]+$/.test(host);

if (validHost) {
	try {
		const url = new URL(host);
		validHost =
			url.protocol === "https:" &&
			Boolean(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash;
	} catch {
		validHost = false;
	}
}

if (!validHost) {
	errors.push("NEXT_PUBLIC_POSTHOG_HOST must be one clean HTTPS API host URL");
}

if (errors.length > 0) {
	for (const error of errors) console.error(`posthog-env: ${error}`);
	process.exit(1);
}

console.log("posthog-env: public analytics configuration is valid");
