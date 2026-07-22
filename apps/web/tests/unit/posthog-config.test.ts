import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolvePostHogConfig } from "../../lib/posthogConfig";

const VALID_KEY = `phc_${"a".repeat(32)}`;
const BUILD_GATE = resolve(
	process.cwd(),
	"../../tools/scripts/check-posthog-env.mjs",
);

function runBuildGate(overrides: Record<string, string> = {}) {
	const env = { ...process.env };
	delete env.NEXT_PUBLIC_POSTHOG_KEY;
	delete env.NEXT_PUBLIC_POSTHOG_HOST;
	delete env.VERCEL_ENV;

	return spawnSync(process.execPath, [BUILD_GATE], {
		encoding: "utf8",
		env: { ...env, ...overrides },
	});
}

describe("PostHog public configuration", () => {
	it("accepts a clean project key and HTTPS API host", () => {
		expect(
			resolvePostHogConfig(VALID_KEY, "https://us.i.posthog.com/"),
		).toEqual({
			key: VALID_KEY,
			host: "https://us.i.posthog.com",
		});
	});

	it("allows a clean first-party reverse proxy path", () => {
		expect(
			resolvePostHogConfig(VALID_KEY, "https://events.example.com/ingest"),
		).toEqual({
			key: VALID_KEY,
			host: "https://events.example.com/ingest",
		});
	});

	it.each([
		[undefined, "https://us.i.posthog.com"],
		[VALID_KEY, undefined],
		["formatted table containing phc_bad", "https://us.i.posthog.com"],
		[VALID_KEY, "https://us.i.posthog.com\nNEXT_PUBLIC_POSTHOG_HOST"],
		[VALID_KEY, "http://us.i.posthog.com"],
		[VALID_KEY, "https://user:password@us.i.posthog.com"],
		[VALID_KEY, "https://us.i.posthog.com?debug=1"],
	])("rejects malformed or incomplete values", (key, host) => {
		expect(resolvePostHogConfig(key, host)).toBeNull();
	});
});

describe("PostHog build gate", () => {
	it("allows an unconfigured local build", () => {
		const result = runBuildGate();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("analytics is not configured");
	});

	it("rejects an unconfigured production build", () => {
		const result = runBuildGate({ VERCEL_ENV: "production" });
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("production requires");
	});

	it.each([
		{ NEXT_PUBLIC_POSTHOG_KEY: VALID_KEY },
		{ NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" },
	])("rejects a partial configuration", (overrides) => {
		const result = runBuildGate(overrides);
		expect(result.status).toBe(1);
	});

	it("rejects formatted or multiline configuration values", () => {
		const result = runBuildGate({
			NEXT_PUBLIC_POSTHOG_KEY: "formatted table containing phc_bad",
			NEXT_PUBLIC_POSTHOG_HOST:
				"https://us.i.posthog.com\nNEXT_PUBLIC_POSTHOG_HOST",
		});
		expect(result.status).toBe(1);
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"formatted table containing phc_bad",
		);
	});

	it("accepts a complete clean configuration", () => {
		const result = runBuildGate({
			NEXT_PUBLIC_POSTHOG_KEY: VALID_KEY,
			NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("configuration is valid");
	});
});
