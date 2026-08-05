export type SwipeAction = "pass" | "save" | "apply";

export type SwipeGestureAxis = "pending" | "horizontal" | "vertical";

/**
 * Deck shortcuts belong to the explicitly focusable deck, not to controls
 * rendered inside it. React portal events still carry a different target, so
 * this also protects inputs/buttons inside card dialogs.
 */
export function deckOwnsKeyboardEvent(
	target: EventTarget | null,
	currentTarget: EventTarget | null,
): boolean {
	return target === currentTarget;
}

/** Lock a touch gesture to one axis only after it clears tap slop. */
export function classifyTouchGesture(
	dx: number,
	dy: number,
	tapSlop: number,
): SwipeGestureAxis {
	if (Math.hypot(dx, dy) <= tapSlop) return "pending";
	// A diagonal gesture belongs to vertical page scrolling unless horizontal
	// intent is stronger. This makes reaching a tall card's action row reliable.
	return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

export interface SwipeReleaseInput {
	readonly pointerType: string;
	readonly axis: SwipeGestureAxis;
	readonly dx: number;
	readonly dy: number;
	readonly commitDistance: number;
}

/**
 * Resolve a committed pointer gesture. Touch reserves the vertical axis for
 * native page scrolling; touch Apply remains available in the visible card row.
 * Fine pointers retain all three drag directions.
 */
export function resolveSwipeRelease({
	pointerType,
	axis,
	dx,
	dy,
	commitDistance,
}: SwipeReleaseInput): SwipeAction | null {
	if (pointerType === "touch") {
		if (axis !== "horizontal") return null;
		if (dx > commitDistance) return "save";
		if (dx < -commitDistance) return "pass";
		return null;
	}

	if (dx > commitDistance) return "save";
	if (dx < -commitDistance) return "pass";
	if (dy < -commitDistance) return "apply";
	return null;
}
