import { describe, expect, it } from "vitest";

import {
	classifyTouchGesture,
	deckOwnsKeyboardEvent,
	resolveSwipeRelease,
} from "../../components/seeker/swipeInput";

describe("swipe deck input ownership", () => {
	it("runs shortcuts only when the deck itself owns the key event", () => {
		const deck = {} as EventTarget;
		const childControl = {} as EventTarget;

		expect(deckOwnsKeyboardEvent(deck, deck)).toBe(true);
		expect(deckOwnsKeyboardEvent(childControl, deck)).toBe(false);
		// A React portal child also has a distinct target/currentTarget pair.
		expect(deckOwnsKeyboardEvent(childControl, deck)).toBe(false);
	});
});

describe("touch gesture axis ownership", () => {
	it("keeps taps pending and gives vertical/diagonal movement to page scroll", () => {
		expect(classifyTouchGesture(4, 5, 10)).toBe("pending");
		expect(classifyTouchGesture(8, -24, 10)).toBe("vertical");
		expect(classifyTouchGesture(20, 20, 10)).toBe("vertical");
	});

	it("preserves intentional horizontal Skip and Save swipes", () => {
		expect(classifyTouchGesture(30, 8, 10)).toBe("horizontal");
		expect(
			resolveSwipeRelease({
				pointerType: "touch",
				axis: "horizontal",
				dx: 140,
				dy: -20,
				commitDistance: 120,
			}),
		).toBe("save");
		expect(
			resolveSwipeRelease({
				pointerType: "touch",
				axis: "horizontal",
				dx: -140,
				dy: -20,
				commitDistance: 120,
			}),
		).toBe("pass");
	});

	it("never turns a touch scroll into Apply while retaining fine-pointer Apply", () => {
		const base = {
			axis: "vertical" as const,
			dx: 0,
			dy: -180,
			commitDistance: 120,
		};

		expect(resolveSwipeRelease({ pointerType: "touch", ...base })).toBeNull();
		expect(resolveSwipeRelease({ pointerType: "mouse", ...base })).toBe("apply");
	});
});
