/**
 * Unsubscribe trust boundary:
 *
 *  - Tokens are scoped, expiring, HMAC-verified; any tampering invalidates.
 *  - No raw user ids leak: the payload is opaque base64url, never a bare id
 *    in a query param an intermediary would log as meaningful.
 *  - Applying is idempotent and RESTRICTION-only; materializing a first
 *    engine row preserves legacy opt-outs (a migration can never
 *    re-subscribe someone).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
	getEnginePrefs: vi.fn(),
	getLegacySeekerEmailBooleans: vi.fn(),
	upsertEnginePrefs: vi.fn(),
}));
vi.mock("@explore-and-earn/db", () => db);

import {
	createUnsubscribeToken,
	verifyUnsubscribeToken,
} from "../../services/notifications/unsubscribe";
import { applyUnsubscribe } from "../../services/notifications/unsubscribeApply";

const NOW = Date.parse("2026-07-14T15:00:00.000Z");

describe("signed unsubscribe tokens", () => {
	it("round-trips a valid scoped token", () => {
		const token = createUnsubscribeToken({
			clerkUserId: "clerk_u1",
			scope: "messages",
			nowMs: NOW,
		});
		expect(token).toBeTruthy();
		const payload = verifyUnsubscribeToken(token!, NOW + 1000);
		expect(payload).toMatchObject({
			clerkUserId: "clerk_u1",
			scope: "messages",
			channel: "email",
		});
	});

	it("supports the 'all' scope", () => {
		const token = createUnsubscribeToken({ clerkUserId: "clerk_u1", scope: "all", nowMs: NOW });
		expect(verifyUnsubscribeToken(token!, NOW)?.scope).toBe("all");
	});

	it("rejects tampered payloads (scope/user swap)", () => {
		const token = createUnsubscribeToken({
			clerkUserId: "clerk_u1",
			scope: "messages",
			nowMs: NOW,
		})!;
		const [version, payloadB64, mac] = token.split(".");
		const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
		const forged = Buffer.from(
			JSON.stringify({ ...decoded, clerkUserId: "clerk_VICTIM" }),
			"utf8",
		).toString("base64url");
		expect(verifyUnsubscribeToken(`${version}.${forged}.${mac}`, NOW)).toBeNull();
	});

	it("rejects truncated/garbage/foreign-version tokens", () => {
		expect(verifyUnsubscribeToken("", NOW)).toBeNull();
		expect(verifyUnsubscribeToken("v1.abc", NOW)).toBeNull();
		expect(verifyUnsubscribeToken("v9.a.b", NOW)).toBeNull();
		expect(verifyUnsubscribeToken("not a token at all", NOW)).toBeNull();
	});

	it("rejects expired tokens", () => {
		const token = createUnsubscribeToken({
			clerkUserId: "clerk_u1",
			scope: "all",
			nowMs: NOW,
			ttlDays: 1,
		})!;
		expect(verifyUnsubscribeToken(token, NOW + 2 * 86_400_000)).toBeNull();
	});

	it("rejects invalid scopes even when correctly signed shape-wise", () => {
		const token = createUnsubscribeToken({
			clerkUserId: "clerk_u1",
			// @ts-expect-error — deliberately outside the closed scope set
			scope: "everything",
			nowMs: NOW,
		})!;
		expect(verifyUnsubscribeToken(token, NOW)).toBeNull();
	});

	it("never embeds the raw clerk id in plain text", () => {
		const token = createUnsubscribeToken({
			clerkUserId: "clerk_u1",
			scope: "messages",
			nowMs: NOW,
		})!;
		// The id is inside the signed base64url payload, not readable verbatim.
		expect(token).not.toContain("clerk_u1");
	});
});

describe("applyUnsubscribe", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		db.getEnginePrefs.mockResolvedValue(null);
		db.getLegacySeekerEmailBooleans.mockResolvedValue(new Map());
		db.upsertEnginePrefs.mockResolvedValue(undefined);
	});

	it("'all' scope flips the email master switch off (seeding the first row)", async () => {
		await applyUnsubscribe("clerk_u1", "all");
		expect(db.upsertEnginePrefs).toHaveBeenCalledWith(
			"clerk_u1",
			expect.objectContaining({ emailEnabled: false }),
		);
		// First-row materialization seeds the full effective category map so a
		// later email re-enable can't resurrect silently-defaulted categories.
		const [, patch] = db.upsertEnginePrefs.mock.calls[0];
		expect(patch.categoryPrefs).toBeDefined();
	});

	it("category scope turns off exactly that category's email", async () => {
		await applyUnsubscribe("clerk_u1", "matches");
		const [, patch] = db.upsertEnginePrefs.mock.calls[0];
		const categories = patch.categoryPrefs as Record<
			string,
			{ email: string; push: string; in_app: string }
		>;
		expect(categories.matches.email).toBe("off");
		// Others keep their defaults.
		expect(categories.applications.email).toBe("immediate");
		expect(categories.messages.email).toBe("immediate");
	});

	it("materializing the FIRST engine row preserves legacy opt-outs", async () => {
		db.getLegacySeekerEmailBooleans.mockResolvedValue(
			new Map([
				[
					"clerk_u1",
					{ email_on_invite: false, email_on_status_change: true, email_on_message: true },
				],
			]),
		);
		await applyUnsubscribe("clerk_u1", "matches");
		const [, patch] = db.upsertEnginePrefs.mock.calls[0];
		const categories = patch.categoryPrefs as Record<string, { email: string }>;
		// The unsubscribe target…
		expect(categories.matches.email).toBe("off");
		// …AND the pre-existing legacy invite opt-out both hold.
		expect(categories.offers_invites.email).toBe("off");
	});

	it("is idempotent — repeating the same unsubscribe converges", async () => {
		db.getEnginePrefs.mockResolvedValue({
			clerk_user_id: "clerk_u1",
			email_enabled: true,
			push_enabled: false,
			in_app_enabled: true,
			category_prefs: {
				matches: { email: "off", push: "off", in_app: "on" },
			},
			quiet_hours_enabled: false,
			quiet_start_minute: null,
			quiet_end_minute: null,
			timezone: null,
			locale: null,
		});
		await applyUnsubscribe("clerk_u1", "matches");
		const [, patch] = db.upsertEnginePrefs.mock.calls[0];
		expect(
			(patch.categoryPrefs as Record<string, { email: string }>).matches.email,
		).toBe("off");
	});
});
