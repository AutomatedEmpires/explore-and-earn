import { describe, expect, it, vi } from "vitest";

import {
	persistExclusiveListingDecision,
	persistListingDecision,
	resolveListingDecision,
	type ListingDecisionWrites,
} from "../../lib/exclusiveListingDecision";

function writes(
	overrides: Partial<Record<keyof ListingDecisionWrites, boolean>> = {},
) {
	const calls: string[] = [];
	const make = (name: keyof ListingDecisionWrites) =>
		vi.fn(async () => {
			calls.push(name);
			return { ok: overrides[name] ?? true };
		});
	return {
		calls,
		writes: {
			save: make("save"),
			unsave: make("unsave"),
			pass: make("pass"),
			unpass: make("unpass"),
		} satisfies ListingDecisionWrites,
	};
}

describe("exclusive Map listing decisions", () => {
	it("removes a pass before saving", async () => {
		const harness = writes();
		const result = await persistExclusiveListingDecision(
			{ saved: false, skipped: true },
			"saved",
			harness.writes,
		);

		expect(harness.calls).toEqual(["unpass", "save"]);
		expect(result).toEqual({
			ok: true,
			decision: "saved",
			consistent: true,
		});
	});

	it("restores the prior pass when Save fails after clearing it", async () => {
		const harness = writes({ save: false });
		const result = await persistExclusiveListingDecision(
			{ saved: false, skipped: true },
			"saved",
			harness.writes,
		);

		expect(harness.calls).toEqual(["unpass", "save", "pass"]);
		expect(result).toEqual({
			ok: false,
			decision: "skipped",
			consistent: true,
		});
	});

	it("restores a saved row when Skip fails after unsaving", async () => {
		const harness = writes({ pass: false });
		const result = await persistExclusiveListingDecision(
			{ saved: true, skipped: false },
			"skipped",
			harness.writes,
		);

		expect(harness.calls).toEqual(["unsave", "pass", "save"]);
		expect(result).toEqual({
			ok: false,
			decision: "saved",
			consistent: true,
		});
	});

	it("reports a failed compensation as an exclusive empty state", async () => {
		const harness = writes({ save: false, pass: false });
		const result = await persistExclusiveListingDecision(
			{ saved: false, skipped: true },
			"saved",
			harness.writes,
		);

		expect(harness.calls).toEqual(["unpass", "save", "pass"]);
		expect(result).toEqual({
			ok: false,
			decision: null,
			consistent: true,
			rollbackFailed: true,
		});
	});

	it("repairs a pre-existing contradictory pair by clearing the opposite", async () => {
		const harness = writes();
		const result = await persistExclusiveListingDecision(
			{ saved: true, skipped: true },
			"saved",
			harness.writes,
		);

		expect(harness.calls).toEqual(["unpass"]);
		expect(result).toEqual({
			ok: true,
			decision: "saved",
			consistent: true,
		});
	});

	it("clears a consistent prior decision for Undo", async () => {
		const harness = writes();
		const result = await persistListingDecision(
			{ saved: true, skipped: false },
			null,
			harness.writes,
		);

		expect(harness.calls).toEqual(["unsave"]);
		expect(result).toEqual({
			ok: true,
			decision: null,
			consistent: true,
		});
	});

	it("does not guess an authoritative decision for contradictory persistence", () => {
		expect(resolveListingDecision({ saved: true, skipped: true })).toEqual({
			decision: null,
			consistent: false,
		});
	});
});
