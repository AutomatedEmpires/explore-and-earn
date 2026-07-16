/**
 * Staged-activation resolution invariants:
 *
 *  - FAIL CLOSED: unset/invalid stage resolves 'disabled' in production and
 *    'enabled' in dev/test — misconfiguration can narrow delivery, never
 *    widen it.
 *  - DETERMINISTIC COHORT: the limited-stage bucket is stable per user, so a
 *    recipient never flaps in and out of delivery across dispatcher retries.
 *  - ALLOWLIST: internal_preview and limited always deliver to allowlisted
 *    Clerk ids and suppress everyone else with a ledger-visible reason.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	NOTIFICATION_ENGINE_STAGES,
	resolveEngineStage,
	rolloutBucket,
	stageGateForSend,
} from "../../services/notifications/stage";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("resolveEngineStage", () => {
	it("accepts every ladder value (trimmed, case-insensitive)", () => {
		for (const stage of NOTIFICATION_ENGINE_STAGES) {
			vi.stubEnv("NOTIFICATION_ENGINE_STAGE", ` ${stage.toUpperCase()} `);
			expect(resolveEngineStage()).toBe(stage);
		}
	});

	it("unset resolves 'enabled' outside production (dev/test keep exercising the engine)", () => {
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "");
		expect(resolveEngineStage()).toBe("enabled");
	});

	it("unset and invalid values FAIL CLOSED to 'disabled' in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "");
		expect(resolveEngineStage()).toBe("disabled");
		vi.stubEnv("NOTIFICATION_ENGINE_STAGE", "everything-on-please");
		expect(resolveEngineStage()).toBe("disabled");
	});
});

describe("stageGateForSend", () => {
	it("enabled sends to everyone; ledger_only/dry_run suppress everyone with stage reasons", () => {
		expect(stageGateForSend("enabled", "user_a")).toEqual({ send: true });
		expect(stageGateForSend("ledger_only", "user_a")).toEqual({
			send: false,
			reason: "stage:ledger_only",
		});
		expect(stageGateForSend("dry_run", "user_a")).toEqual({
			send: false,
			reason: "stage:dry_run",
		});
	});

	it("internal_preview delivers only to the allowlist", () => {
		vi.stubEnv("NOTIFICATION_INTERNAL_ALLOWLIST", "user_a , user_b");
		expect(stageGateForSend("internal_preview", "user_a")).toEqual({ send: true });
		expect(stageGateForSend("internal_preview", "user_c")).toEqual({
			send: false,
			reason: "stage:internal_preview",
		});
	});

	it("limited: allowlist always sends; percent bounds the rest; 100 sends to all", () => {
		vi.stubEnv("NOTIFICATION_INTERNAL_ALLOWLIST", "user_a");
		vi.stubEnv("NOTIFICATION_LIMITED_PERCENT", "0");
		expect(stageGateForSend("limited", "user_a")).toEqual({ send: true });
		expect(stageGateForSend("limited", "user_z")).toEqual({
			send: false,
			reason: "stage:limited",
		});
		vi.stubEnv("NOTIFICATION_LIMITED_PERCENT", "100");
		expect(stageGateForSend("limited", "user_z")).toEqual({ send: true });
	});

	it("limited cohort is deterministic per recipient", () => {
		const bucket = rolloutBucket("user_stable");
		for (let i = 0; i < 5; i += 1) {
			expect(rolloutBucket("user_stable")).toBe(bucket);
		}
		expect(bucket).toBeGreaterThanOrEqual(0);
		expect(bucket).toBeLessThan(100);
	});
});
