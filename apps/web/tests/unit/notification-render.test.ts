/**
 * Locale-aware rendering (services/notifications/render.ts):
 *
 *  - CATALOG DRIFT GUARD: every NOTIFICATION_TYPES entry must have a real
 *    "en" title/body — a type added to the taxonomy without matching catalog
 *    copy fails this test instead of silently shipping raw keys to users.
 *  - Missing-key and unknown-locale fallbacks never throw.
 *  - isSafeDestinationPath / localizedPath: the open-redirect guard every
 *    channel (email, push, in-app) depends on.
 *
 * routing (../../i18n/routing) is used for real — locales: ["en"],
 * defaultLocale: "en" — so locale-fallback behavior is exercised against the
 * actual catalog, not a stand-in.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NOTIFICATION_TYPES } from "@explore-and-earn/contracts";

import {
	isSafeDestinationPath,
	localizedPath,
	renderMessage,
	renderNotification,
} from "../../services/notifications/render";

const ALL_VALUES = {
	listingTitle: "Test Listing",
	count: 2,
	searchLabel: "s",
	hoursLeft: 3,
	daysLeft: 2,
	completion: 60,
};

describe("renderNotification — catalog drift guard", () => {
	it.each(NOTIFICATION_TYPES)("type '%s' has non-empty, non-raw-key en title/body", async (type) => {
		const result = await renderNotification({
			locale: "en",
			titleKey: `Notifications.types.${type}.title`,
			bodyKey: `Notifications.types.${type}.body`,
			values: ALL_VALUES,
		});
		expect(result.locale).toBe("en");
		expect(result.title.length).toBeGreaterThan(0);
		expect(result.body.length).toBeGreaterThan(0);
		expect(result.title).not.toBe(`Notifications.types.${type}.title`);
		expect(result.body).not.toBe(`Notifications.types.${type}.body`);
	});
});

describe("renderNotification — fallback behavior", () => {
	it("a missing key returns the raw keys as title/body, never throws", async () => {
		const result = await renderNotification({
			locale: "en",
			titleKey: "Notifications.types.does_not_exist.title",
			bodyKey: "Notifications.types.does_not_exist.body",
			values: {},
		});
		expect(result).toEqual({
			title: "Notifications.types.does_not_exist.title",
			body: "Notifications.types.does_not_exist.body",
			locale: "en",
		});
	});

	it("an unknown locale falls back to the en catalog and reports locale 'en'", async () => {
		const result = await renderNotification({
			locale: "xx",
			titleKey: "Notifications.types.application_received.title",
			bodyKey: "Notifications.types.application_received.body",
			values: { listingTitle: "Sunny Farm" },
		});
		expect(result.locale).toBe("en");
		expect(result.title).toBe("New application received");
		expect(result.body).toContain("Sunny Farm");
	});
});

describe("renderMessage", () => {
	it("renders a real catalog message for a known key", async () => {
		const result = await renderMessage("en", "Notifications.digest.cta", {});
		expect(result).toBe("Open notifications");
	});

	it("falls back to the raw key when missing and no fallback is given", async () => {
		const result = await renderMessage("en", "Notifications.does.not.exist", {});
		expect(result).toBe("Notifications.does.not.exist");
	});

	it("falls back to the provided fallback string when missing", async () => {
		const result = await renderMessage("en", "Notifications.does.not.exist", {}, "Default copy");
		expect(result).toBe("Default copy");
	});
});

describe("isSafeDestinationPath", () => {
	it.each([
		["/applied", true],
		["", false],
		["notrooted", false],
		["//evil.com", false],
		["https://evil.com", false],
		["/ok\r\nSet-Cookie:x", false],
		["/a://b", false],
		["/" + "a".repeat(2048), false],
	] as const)("%s -> %s", (path, expected) => {
		expect(isSafeDestinationPath(path)).toBe(expected);
	});
});

describe("localizedPath", () => {
	it("the default locale is unprefixed", () => {
		expect(localizedPath("en", "/applied")).toBe("/applied");
	});

	it("an unsafe path collapses to '/'", () => {
		expect(localizedPath("en", "https://evil.com")).toBe("/");
		expect(localizedPath("en", "//evil.com")).toBe("/");
	});

	it("an unknown (non-catalog) locale returns the path unchanged", () => {
		expect(localizedPath("xx", "/applied")).toBe("/applied");
	});
});
