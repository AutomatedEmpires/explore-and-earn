"use client";

import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OpportunityCategory } from "@explore-and-earn/contracts";
import { Button, Icon } from "@explore-and-earn/ui";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	DiscoveryCardSkeleton,
	EmptyState,
	ListingCard,
	ListingCardProvider,
	type DiscoveryListing,
	type ListingCardPopupOverrides,
} from "../discovery";
import { SeekFilterPopup, type SeekFilterPopupValue } from "./SeekFilterPopup";
import { SeekSortPopup } from "./SeekSortPopup";
import {
	restoreListingDecisionAction,
	setListingDecisionAction,
	type ListingDecision,
	type ListingDecisionActionResult,
} from "../../app/actions/mapDecisions";
import {
	getSwipeBatchAction,
	unpassListingAction,
} from "../../app/actions/swipe";
import { byMonetization } from "../../lib/ranking";
import { SEEKER_DISCOVERY_EVENTS, captureEvent } from "../../lib/analytics";
import {
	classifyTouchGesture,
	deckOwnsKeyboardEvent,
	resolveSwipeRelease,
	type SwipeAction,
	type SwipeGestureAxis,
} from "./swipeInput";
import styles from "./SwipeDeck.module.css";

interface Decision {
	readonly id: string;
	readonly action: Exclude<SwipeAction, "apply">;
	/** Authoritative state returned before this deck decision was persisted. */
	readonly previousDecision: ListingDecision;
}

/** Drag distance (px) past which a release commits the swipe. */
const COMMIT_DISTANCE = 120;
/**
 * Movement (px) past which a pointer gesture is treated as a drag rather than a
 * tap. Below this, a pointerup is a tap and the trailing click opens the card's
 * popup; at/above it the click is swallowed so a drag never fires a card action.
 */
const TAP_SLOP = 10;
/** Throw-off / snap-back durations (ms); kept in sync with the inline CSS transition. */
const THROW_MS = 240;
const SNAP_MS = 160;
/** How long the "Skipped" / "Saved" confirm toast lingers (long enough to hit Undo). */
const FEEDBACK_MS = 2200;
/** Top card + cards peeking behind it. */
const MAX_VISIBLE = 3;
/** Prefetch the next page once the deck has this many (or fewer) cards left. */
const PREFETCH_REMAINING = 5;

/**
 * Monetization order (shared "pay more, show more" util). The only signals a
 * listing view-model carries are the boosted badge and the match score, so we
 * map those; missing signals degrade to rank 0 (shown, but last). Never hides —
 * only orders — as a tiebreaker WITHIN each fetched batch.
 */
const orderByMonetization = byMonetization<DiscoveryListing>((listing) => ({
	boosted: listing.conditionalBadges?.includes("boosted") ?? false,
	hostTier: listing.host?.tier,
	matchScore: listing.matchScore,
}));

const EMPTY_FILTERS: SeekFilterPopupValue = {
	housing: false,
	meals: false,
	visaSupport: false,
};

/**
 * Does a listing survive the active sort lane + filter set? Filters HIDE only on
 * a positive mismatch — a listing whose data can't be judged on a given axis is
 * kept, so a filter never silently empties the deck on missing fields.
 */
function listingMatches(
	listing: DiscoveryListing,
	lane: OpportunityCategory | null,
	filters: SeekFilterPopupValue,
): boolean {
	if (lane && listing.category !== lane) {
		return false;
	}
	if (filters.housing && listing.benefits.housing.provision !== "provided") {
		return false;
	}
	if (filters.meals && listing.benefits.meals.provision !== "provided") {
		return false;
	}
	if (filters.visaSupport && listing.visaSupport !== true) {
		return false;
	}
	if (filters.payMin && filters.payMin > 0) {
		const cents = listing.payInsight?.minCents;
		const unit = listing.payInsight?.unit ?? undefined;
		const comparable = !filters.payUnit || unit === filters.payUnit;
		if (cents != null && comparable && cents < filters.payMin * 100) {
			return false;
		}
	}
	if (filters.startRangeMonths && listing.begins) {
		const startsAt = Date.parse(listing.begins);
		if (!Number.isNaN(startsAt)) {
			const horizon = Date.now() + filters.startRangeMonths * 31 * 86_400_000;
			if (startsAt > horizon) {
				return false;
			}
		}
	}
	return true;
}

export interface SwipeDeckProps {
	readonly listings: readonly DiscoveryListing[];
	/** published_at of the last server row, or null when there is no next page. */
	readonly initialCursor?: string | null;
	/** False for unauthenticated visitors — shows the first card but gates all swipe actions. */
	readonly isAuthenticated?: boolean;
}

/**
 * SwipeDeck — the immersive /swipe surface. A true Tinder-style deck built on the
 * SINGLE canonical DiscoveryCard, rendered through the shared <ListingCard>
 * wrapper ("swipe" surface) so the card's popups — Quick Peek, Host, Benefit
 * (Housing/Meals), Pay, Report — open on a tap while a drag still throws the
 * card. The top card shows the same 20/60/20 Skip · Apply · Save row as Seek,
 * wired to the canonical decision/navigation paths; a tap-vs-drag guard (suppressTap)
 * swallows the trailing click
 * when the pointer moved past the tap slop, so a swipe-release over a control
 * never fires a card action. The page around it is stripped to just the card:
 * drag to throw, a peeking stack, edge-glow / labeled overlays that scale with
 * the drag, flanking arrow controls on ≥768 (Skip left / Save right), full
 * keyboard control, a confirm toast with one-tap Undo, and in-place Sort /
 * Filter (the same popups /seek uses). Motion honors prefers-reduced-motion.
 *
 * "Better than Tinder" here means values-first (Housing/Meals/Pay always on the
 * card), match shown neutrally by the card itself, and a no-cost Undo — zero
 * dark patterns. The on-card row is the direct touch/keyboard path; gestures
 * and desktop flank arrows remain alternate inputs, and the dock keeps Undo.
 *
 * End-of-deck: skipped listings are demote-but-not-gone — when the deck empties,
 * "Review skipped (N)" re-queues the ones passed this session (un-persisting each
 * pass) so they get a second look.
 *
 * Order: each fetched batch is monetization-ranked (byMonetization) as a
 * tiebreaker after the server's batch order; batches stay in fetch order and
 * nothing is ever hidden.
 *
 * Infinite load: seeds from the server-fetched first batch, then pre-fetches the
 * next page once PREFETCH_REMAINING cards remain, appending de-duplicated,
 * monetization-ordered rows until the feed is exhausted (nextCursor === null).
 *
 * Sort / Filter run client-side over the loaded deck (the swipe stream isn't a
 * URL-driven server query), reusing SeekSortPopup (lane) and SeekFilterPopup
 * (housing/meals/visa/pay/begins). Applying either starts the filtered deck
 * fresh.
 *
 * Persistence: Save/Skip use the server-authoritative exclusive transition and
 * move the deck only after it confirms success. History records the prior
 * authoritative decision; Undo restores that exact state only when the current
 * persisted decision still matches this deck's expected value.
 */
export function SwipeDeck({ listings, initialCursor = null, isAuthenticated = true }: SwipeDeckProps) {
	const router = useRouter();
	const [deck, setDeck] = useState<DiscoveryListing[]>(() => [...listings].sort(orderByMonetization));
	const [cursor, setCursor] = useState<string | null>(initialCursor);
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [index, setIndex] = useState(0);
	const [decisions, setDecisions] = useState<readonly Decision[]>([]);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragging, setDragging] = useState(false);
	const [leaving, setLeaving] = useState<SwipeAction | null>(null);
	const [reducedMotion, setReducedMotion] = useState(false);
	const [feedback, setFeedback] = useState<"pass" | "save" | null>(null);
	const [decisionError, setDecisionError] = useState<string | null>(null);
	const [undoing, setUndoing] = useState(false);

	// Sort / filter — client-side over the loaded deck. `lane` is the SeekSortPopup
	// category; `filters` is the SeekFilterPopup value.
	const [lane, setLane] = useState<OpportunityCategory | null>(null);
	const [filters, setFilters] = useState<SeekFilterPopupValue>(EMPTY_FILTERS);
	const [sortOpen, setSortOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);

	const [showAuthGate, setShowAuthGate] = useState(false);

	const startRef = useRef<{ x: number; y: number } | null>(null);
	const pointerIdRef = useRef<number | null>(null);
	const pointerTypeRef = useRef("");
	const gestureAxisRef = useRef<SwipeGestureAxis>("pending");
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const deckRef = useRef<DiscoveryListing[]>(deck);
	const loadingRef = useRef(false);
	const decisionInFlightRef = useRef(false);
	const undoInFlightRef = useRef(false);
	const authGateDismissRef = useRef<HTMLButtonElement | null>(null);
	const preGateFocusRef = useRef<HTMLElement | null>(null);
	// Tap-vs-drag guard for the on-card popups. A pointer gesture on the top card
	// bubbles from a card control (host / triad / pay / report / Quick Apply) up to
	// the deck's pointer handlers; if the pointer moved past the tap slop we mark
	// it a drag so the trailing `click` on that control is swallowed (a drag-
	// release over a button swipes instead of opening a popup). Reset on each new
	// pointerdown; read by `suppressTap` at click time.
	const wasDragRef = useRef(false);

	useEffect(() => {
		deckRef.current = deck;
	}, [deck]);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) {
			return;
		}
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		return () => {
			if (leaveTimer.current) {
				clearTimeout(leaveTimer.current);
			}
			if (feedbackTimer.current) {
				clearTimeout(feedbackTimer.current);
			}
		};
	}, []);

	useEffect(() => {
		if (showAuthGate) {
			preGateFocusRef.current = document.activeElement as HTMLElement;
			authGateDismissRef.current?.focus();
		} else {
			preGateFocusRef.current?.focus();
			preGateFocusRef.current = null;
		}
	}, [showAuthGate]);

	// The visible deck: the loaded rows that survive the active lane + filters.
	// Already monetization-ordered (the raw deck is ordered per batch), so the
	// filtered view inherits that order.
	const view = useMemo(
		() => deck.filter((listing) => listingMatches(listing, lane, filters)),
		[deck, lane, filters],
	);
	const total = view.length;

	const loadMore = useCallback(async () => {
		if (loadingRef.current || cursor === null) {
			return;
		}
		loadingRef.current = true;
		setLoadingMore(true);
		try {
			const excludeIds = deckRef.current.map((listing) => listing.id);
			const batch = await getSwipeBatchAction(excludeIds, cursor);
			setDeck((prev) => {
				const seen = new Set(prev.map((listing) => listing.id));
				const additions = batch.listings
					.filter((listing) => !seen.has(listing.id))
					.sort(orderByMonetization);
				return additions.length > 0 ? [...prev, ...additions] : prev;
			});
			setCursor(batch.nextCursor);
		} catch {
			setLoadError(true);
		} finally {
			loadingRef.current = false;
			setLoadingMore(false);
		}
	}, [cursor]);

	useEffect(() => {
		const remaining = view.length - index;
		if (remaining <= PREFETCH_REMAINING && cursor !== null && !loadingRef.current) {
			void loadMore();
		}
	}, [index, view.length, cursor, loadMore]);

	const triggerLeave = useCallback(
		async (action: SwipeAction) => {
			if (leaving || decisionInFlightRef.current || undoInFlightRef.current) {
				return;
			}
			const card = view[index];
			if (!card) {
				return;
			}

			// Apply is navigation, not a deck decision. The listing route validates
			// eligibility and owns the safe auth return while retaining `apply=1`.
			if (action === "apply") {
				setDragging(false);
				setOffset({ x: 0, y: 0 });
				router.push(`/listing/${card.id}?apply=1`);
				return;
			}

			if (!isAuthenticated) {
				setDragging(false);
				setOffset({ x: 0, y: 0 });
				setShowAuthGate(true);
				return;
			}

			decisionInFlightRef.current = true;
			setLeaving(action);
			setDragging(false);
			setOffset({ x: 0, y: 0 });
			setDecisionError(null);

			const requestedDecision = action === "save" ? "saved" : "skipped";
			const result = await setListingDecisionAction(
				card.id,
				requestedDecision,
			).catch(
				(): ListingDecisionActionResult => ({ ok: false, consistent: false }),
			);
			const previousDecision = result.previousDecision;
			if (
				!result.ok ||
				!result.consistent ||
				result.decision !== requestedDecision ||
				previousDecision === undefined
			) {
				decisionInFlightRef.current = false;
				setLeaving(null);
				setDecisionError(
					action === "save"
						? "We couldn’t confirm that save. The opportunity stayed here—try again."
						: "We couldn’t confirm that skip. The opportunity stayed here—try again.",
				);
				return;
			}

			captureEvent(
				action === "save"
					? SEEKER_DISCOVERY_EVENTS.listingSaved
					: SEEKER_DISCOVERY_EVENTS.listingSkipped,
				{ surface: "swipe" },
			);
			setDecisions((prev) => [
				...prev,
				{ id: card.id, action, previousDecision },
			]);
			setFeedback(action);
			if (feedbackTimer.current) {
				clearTimeout(feedbackTimer.current);
			}
			feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
			setOffset({ x: action === "save" ? 720 : -720, y: 0 });
			if (leaveTimer.current) {
				clearTimeout(leaveTimer.current);
			}
			leaveTimer.current = setTimeout(
				() => {
					setIndex((value) => value + 1);
					setOffset({ x: 0, y: 0 });
					setLeaving(null);
					decisionInFlightRef.current = false;
				},
				reducedMotion ? 0 : THROW_MS,
			);
		},
		[isAuthenticated, leaving, view, index, reducedMotion, router],
	);

	// Drag guard read by every on-card control at click time: true iff the last
	// pointer gesture crossed the tap slop (i.e. was a drag, not a tap). Stable
	// identity — reads a ref — so it never thrashes the wrapper's handler memo.
	const suppressTap = useCallback(() => wasDragRef.current, []);

	// The card's on-card 20/60/20 row uses the same real decision/navigation paths
	// as the arrows and gestures. Popup openers (Quick Peek / Host / Benefit / Pay /
	// Report / location→map) keep the wrapper defaults, so they open while swiping.
	const cardOverrides = useMemo<ListingCardPopupOverrides>(
		() => ({
			onSkip: () => {
				void triggerLeave("pass");
			},
			onApply: () => {
				void triggerLeave("apply");
			},
			onSave: () => {
				void triggerLeave("save");
			},
		}),
		[triggerLeave],
	);

	const undo = useCallback(async () => {
		if (
			!isAuthenticated ||
			leaving ||
			decisionInFlightRef.current ||
			undoInFlightRef.current
		) {
			return;
		}
		const last = decisions[decisions.length - 1];
		if (!last) return;

		undoInFlightRef.current = true;
		setUndoing(true);
		setDecisionError(null);
		const expectedCurrentDecision =
			last.action === "save" ? "saved" : "skipped";
		const result = await restoreListingDecisionAction(
			last.id,
			expectedCurrentDecision,
			last.previousDecision,
		).catch(
			(): ListingDecisionActionResult => ({ ok: false, consistent: false }),
		);
		undoInFlightRef.current = false;
		setUndoing(false);

		if (
			!result.ok ||
			!result.consistent ||
			result.decision !== last.previousDecision
		) {
			setDecisionError(
				"We couldn’t restore that decision. It may have changed elsewhere, so the deck stayed where it was.",
			);
			return;
		}

		if (feedbackTimer.current) {
			clearTimeout(feedbackTimer.current);
		}
		setFeedback(null);
		captureEvent(SEEKER_DISCOVERY_EVENTS.swipeUndo, { surface: "swipe" });
		setDecisions((prev) => prev.slice(0, -1));
		setIndex((value) => Math.max(0, value - 1));
		setOffset({ x: 0, y: 0 });
	}, [decisions, isAuthenticated, leaving]);

	const restart = useCallback(() => {
		setIndex(0);
		setDecisions([]);
		setOffset({ x: 0, y: 0 });
		setLeaving(null);
		setDecisionError(null);
	}, []);

	// End-of-deck recycle. Skipped listings are demote-but-not-gone (founder
	// decision): when the deck empties, re-queue the ones passed THIS session as a
	// fresh review deck and un-persist each pass (best-effort) so they can also
	// resurface in future sessions. Any active lane/filter is cleared so the whole
	// skipped set is reviewable. Terminal mode — pagination is retired (cursor
	// null); "Start over" still replays the full original deck from the parent.
	const reviewSkipped = useCallback(() => {
		const skippedIds = decisions
			.filter((decision) => decision.action === "pass")
			.map((decision) => decision.id);
		if (skippedIds.length === 0) {
			return;
		}
		const wanted = new Set(skippedIds);
		const skippedListings = deckRef.current.filter((listing) => wanted.has(listing.id));
		if (skippedListings.length === 0) {
			return;
		}
		// Un-persist the passes so these are no longer excluded from future decks.
		startTransition(() => {
			for (const id of skippedIds) {
				void unpassListingAction(id).catch(() => {
					/* best-effort; the local re-queue below is what the seeker sees */
				});
			}
		});
		if (leaveTimer.current) {
			clearTimeout(leaveTimer.current);
		}
		if (feedbackTimer.current) {
			clearTimeout(feedbackTimer.current);
		}
		setLane(null);
		setFilters(EMPTY_FILTERS);
		setDeck(skippedListings);
		setCursor(null);
		setDecisions([]);
		setIndex(0);
		setOffset({ x: 0, y: 0 });
		setLeaving(null);
		setFeedback(null);
		setDecisionError(null);
		setLoadError(false);
	}, [decisions]);

	// Applying a lane / filter re-forms the deck, so start the filtered run fresh
	// at the first card. Any in-flight throw/feedback timers are cleared so the
	// reset can't be clobbered by a late setIndex.
	const resetPosition = useCallback(() => {
		if (leaveTimer.current) {
			clearTimeout(leaveTimer.current);
		}
		if (feedbackTimer.current) {
			clearTimeout(feedbackTimer.current);
		}
		setIndex(0);
		setDecisions([]);
		setOffset({ x: 0, y: 0 });
		setLeaving(null);
		setFeedback(null);
		setDecisionError(null);
	}, []);

	const applySort = useCallback(
		(nextLane: OpportunityCategory | null) => {
			setLane(nextLane);
			resetPosition();
			setSortOpen(false);
		},
		[resetPosition],
	);

	const applyFilters = useCallback(
		(next: SeekFilterPopupValue) => {
			setFilters(next);
			resetPosition();
			setFilterOpen(false);
		},
		[resetPosition],
	);

	const clearControls = useCallback(() => {
		setLane(null);
		setFilters(EMPTY_FILTERS);
		resetPosition();
	}, [resetPosition]);

	const current = view[index];
	const savedCount = decisions.filter((decision) => decision.action === "save").length;
	const skippedCount = decisions.filter((decision) => decision.action === "pass").length;
	const filterCount =
		(filters.housing ? 1 : 0) +
		(filters.meals ? 1 : 0) +
		(filters.visaSupport ? 1 : 0) +
		(filters.payMin && filters.payMin > 0 ? 1 : 0) +
		(filters.startRangeMonths ? 1 : 0);
	const controlsActive = filterCount > 0 || lane !== null;

	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		// The deck itself is a focusable shortcut surface. A key event from any
		// descendant belongs to that control instead — including React-portal popup
		// buttons/inputs, whose synthetic events still bubble through this tree.
		if (!deckOwnsKeyboardEvent(event.target, event.currentTarget)) {
			return;
		}
		if (sortOpen || filterOpen || showAuthGate) {
			return;
		}
		if (!current) {
			return;
		}
		switch (event.key) {
			case "ArrowLeft":
				event.preventDefault();
				if (isAuthenticated) void triggerLeave("pass");
				else setShowAuthGate(true);
				break;
			case "ArrowRight":
				event.preventDefault();
				if (isAuthenticated) void triggerLeave("save");
				else setShowAuthGate(true);
				break;
			case "ArrowUp":
				event.preventDefault();
				void triggerLeave("apply");
				break;
			case "Backspace":
				event.preventDefault();
				void undo();
				break;
			// Enter OPENS rather than acting. Every other binding here commits an
			// irreversible-feeling decision, and Enter is the key a keyboard user
			// presses to "look at this" — wiring it to Apply would turn a reflex
			// into an application.
			case "Enter":
				event.preventDefault();
				router.push(`/listing/${current.id}`);
				break;
			default:
				break;
		}
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		// Fresh gesture — assume a tap until the pointer proves otherwise, so the
		// card's popups stay tappable.
		wasDragRef.current = false;
		if (leaving || !current) {
			return;
		}
		pointerIdRef.current = event.pointerId;
		pointerTypeRef.current = event.pointerType;
		gestureAxisRef.current = "pending";
		startRef.current = { x: event.clientX, y: event.clientY };
		setDragging(true);
		// Let touch stay uncaptured until horizontal intent is proven. Combined
		// with touch-action: pan-y, this leaves vertical movement to native scroll.
		if (event.pointerType !== "touch") {
			event.currentTarget.setPointerCapture(event.pointerId);
		}
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging || !startRef.current) {
			return;
		}
		const dx = event.clientX - startRef.current.x;
		const dy = event.clientY - startRef.current.y;
		if (pointerTypeRef.current === "touch") {
			if (gestureAxisRef.current === "pending") {
				const axis = classifyTouchGesture(dx, dy, TAP_SLOP);
				gestureAxisRef.current = axis;
				if (axis !== "pending") wasDragRef.current = true;
				if (axis === "horizontal") {
					try {
						event.currentTarget.setPointerCapture(event.pointerId);
					} catch {
						/* the browser may already own a cancelled pointer */
					}
				}
			}

			if (gestureAxisRef.current !== "horizontal") {
				// Pending stays still; vertical belongs entirely to page scrolling.
				setOffset({ x: 0, y: 0 });
				return;
			}
			setOffset({ x: dx, y: 0 });
			return;
		}
		// Once the pointer travels past the tap slop this gesture is a drag; the
		// trailing click on any card control is then suppressed (see suppressTap).
		if (!wasDragRef.current && Math.hypot(dx, dy) > TAP_SLOP) {
			wasDragRef.current = true;
		}
		setOffset({ x: dx, y: dy });
	};

	const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging) {
			return;
		}
		const start = startRef.current;
		const dx = start ? event.clientX - start.x : 0;
		const dy = start ? event.clientY - start.y : 0;
		const action = resolveSwipeRelease({
			pointerType: pointerTypeRef.current,
			axis: gestureAxisRef.current,
			dx,
			dy,
			commitDistance: COMMIT_DISTANCE,
		});
		if (pointerIdRef.current !== null) {
			try {
				event.currentTarget.releasePointerCapture(pointerIdRef.current);
			} catch {
				/* pointer already released */
			}
		}
		pointerIdRef.current = null;
		pointerTypeRef.current = "";
		gestureAxisRef.current = "pending";
		startRef.current = null;
		setDragging(false);
		setOffset({ x: 0, y: 0 });
		if (action) {
			void triggerLeave(action);
			return;
		}
	};

	const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (pointerIdRef.current !== null) {
			try {
				event.currentTarget.releasePointerCapture(pointerIdRef.current);
			} catch {
				/* native scrolling may already have released the pointer */
			}
		}
		pointerIdRef.current = null;
		pointerTypeRef.current = "";
		gestureAxisRef.current = "pending";
		startRef.current = null;
		setDragging(false);
		setOffset({ x: 0, y: 0 });
	};

	// The Sort / Filter controls stay reachable in every deck state, so extract
	// them once and render them in the immersive top bar for each branch.
	const controlBar = (
		<div className={styles.controlBar}>
			<button
				type="button"
				className={lane ? `${styles.tool} ${styles.toolActive}` : styles.tool}
				onClick={() => setSortOpen(true)}
				disabled={Boolean(leaving) || undoing}
				aria-haspopup="dialog"
			>
				<Icon name={lane ? CATEGORY_ICON[lane] : "action.sort"} size={16} aria-hidden />
				<span className={styles.toolLabel}>{lane ? CATEGORY_LABEL[lane] : "Sort"}</span>
			</button>
			<button
				type="button"
				className={filterCount > 0 ? `${styles.tool} ${styles.toolActive}` : styles.tool}
				onClick={() => setFilterOpen(true)}
				disabled={Boolean(leaving) || undoing}
				aria-haspopup="dialog"
			>
				<Icon name="action.filter" size={16} aria-hidden />
				<span className={styles.toolLabel}>Filter</span>
				{filterCount > 0 ? <span className={styles.toolCount}>{filterCount}</span> : null}
			</button>
		</div>
	);

	const popups = (
		<>
			<SeekSortPopup
				open={sortOpen}
				onClose={() => setSortOpen(false)}
				category={lane ?? undefined}
				onApply={applySort}
			/>
			<SeekFilterPopup
				open={filterOpen}
				onClose={() => setFilterOpen(false)}
				value={filters}
				onApply={applyFilters}
			/>
		</>
	);

	if (!current) {
		// More pages are still in flight (or queued): show skeleton slots rather
		// than the terminal empty state, so a mid-deck refill doesn't flash
		// "all caught up".
		if (loadingMore || cursor !== null) {
			return (
				<div className={styles.deck} aria-busy="true">
					<div className={styles.topBar}>
						<p className={styles.progress}>Finding more opportunities…</p>
						{controlBar}
					</div>
					<div className={styles.arena}>
						<div className={styles.stack}>
							<DiscoveryCardSkeleton />
							<DiscoveryCardSkeleton />
							<DiscoveryCardSkeleton />
						</div>
					</div>
					{popups}
				</div>
			);
		}
		if (loadError) {
			return (
				<div className={styles.deck}>
					<div className={styles.arena}>
						<EmptyState
							title="Couldn't load more"
							message="There was a problem fetching the next batch of opportunities. Try again or browse the full feed under Seek."
						/>
					</div>
					<div className={styles.controls}>
						<Button
							variant="secondary"
							onClick={() => {
								setLoadError(false);
								setCursor(initialCursor);
								restart();
							}}
						>
							Try again
						</Button>
					</div>
				</div>
			);
		}
		// Everything loaded is filtered out → offer a way back to the full deck.
		if (controlsActive) {
			return (
				<div className={styles.deck}>
					<div className={styles.topBar}>
						<p className={styles.progress}>No matches</p>
						{controlBar}
					</div>
					<div className={styles.arena}>
						<EmptyState
							title="No opportunities match"
							message="Your sort lane or filters screened out every loaded opportunity. Clear them to see the full deck again."
						/>
					</div>
					<div className={styles.controls}>
						<Button variant="secondary" icon="action.close" onClick={clearControls}>
							Clear sort &amp; filters
						</Button>
					</div>
					{popups}
				</div>
			);
		}
		const summary =
			savedCount > 0
				? `You saved ${savedCount} ${savedCount === 1 ? "opportunity" : "opportunities"}. Find them under Saved, or run the deck again.`
				: "You've reviewed every opportunity in the deck. Start over, or browse the full feed under Seek.";
		return (
			<div className={styles.deck}>
				<div className={styles.arena}>
					<EmptyState title="You're all caught up" message={summary} />
				</div>
				<div className={styles.controls}>
					{skippedCount > 0 ? (
						<Button variant="secondary" icon="action.back" onClick={reviewSkipped}>
							{`Review skipped (${skippedCount})`}
						</Button>
					) : null}
					<Button variant="secondary" icon="action.back" onClick={restart}>
						Start over
					</Button>
				</div>
			</div>
		);
	}

	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	const passStrength = clamp(-offset.x / COMMIT_DISTANCE);
	const saveStrength = clamp(offset.x / COMMIT_DISTANCE);
	const applyStrength = clamp(-offset.y / COMMIT_DISTANCE);
	const passOverlayStyle: CSSProperties = { opacity: passStrength };
	const saveOverlayStyle: CSSProperties = { opacity: saveStrength };
	const applyOverlayStyle: CSSProperties = { opacity: applyStrength };
	const visible = view.slice(index, index + MAX_VISIBLE);
	const arrowsDisabled = Boolean(leaving) || undoing;

	return (
		<div
			className={styles.deck}
			role="group"
			aria-roledescription="Swipe deck"
			aria-label="Opportunities"
			aria-busy={Boolean(leaving) || undoing}
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<div className={styles.topBar}>
				<p className={styles.progress}>
					Opportunity {index + 1} of {total}
				</p>
				{controlBar}
			</div>

			<div className={styles.arena}>
				{/* Pointer users (≥768) get explicit arrow controls flanking the card;
				    they are hidden under coarse pointers, where the gesture rules. */}
				<button
					type="button"
					className={`${styles.arrow} ${styles.arrowPass}`}
					onClick={() => {
						void triggerLeave("pass");
					}}
					disabled={arrowsDisabled}
					aria-label="Skip this opportunity"
				>
					<Icon name="action.close" size={24} aria-hidden />
				</button>

				<ListingCardProvider
					listings={deck}
					overrides={cardOverrides}
					analyticsSurface="swipe"
				>
				<div className={styles.stack}>
					{visible.map((listing, depth) => {
						const isTop = depth === 0;
						const layerStyle: CSSProperties = isTop
							? {
									position: "relative",
									zIndex: MAX_VISIBLE,
									transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${offset.x * 0.04}deg)`,
									transition: dragging
										? "none"
										: `transform ${reducedMotion ? 0 : leaving ? THROW_MS : SNAP_MS}ms var(--ease-standard)`,
									cursor: dragging ? "grabbing" : "grab",
									// Vertical touch movement scrolls the page to the action row;
									// horizontal movement remains available to Skip / Save.
									touchAction: "pan-y",
									userSelect: "none",
								}
							: {
									position: "absolute",
									inset: 0,
									zIndex: MAX_VISIBLE - depth,
									transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
									transformOrigin: "top center",
									transition: reducedMotion ? "none" : `transform ${SNAP_MS}ms var(--ease-standard)`,
									pointerEvents: "none",
								};
						return (
							<div
								key={listing.id}
								className={styles.cardLayer}
								style={layerStyle}
								aria-hidden={!isTop}
								onPointerDown={isTop ? onPointerDown : undefined}
								onPointerMove={isTop ? onPointerMove : undefined}
								onPointerUp={isTop ? onPointerEnd : undefined}
								onPointerCancel={isTop ? onPointerCancel : undefined}
							>
								{isTop ? (
									<>
										<span className={`${styles.overlay} ${styles.overlayPass}`} style={passOverlayStyle} aria-hidden>
											<Icon name="action.close" size={20} aria-hidden /> Skip
										</span>
										<span className={`${styles.overlay} ${styles.overlaySave}`} style={saveOverlayStyle} aria-hidden>
											<Icon name="action.save" size={20} aria-hidden /> Save
										</span>
										<span className={`${styles.overlay} ${styles.overlayApply}`} style={applyOverlayStyle} aria-hidden>
											<Icon name="action.apply" size={20} aria-hidden /> Apply
										</span>
										{/* Drag feedback — a tinted edge glow whose opacity tracks the
										    drag distance (same tokens as the confirm toast). On coarse
										    pointers the labeled overlays above are hidden and this glow
										    answers the gesture. */}
										<span className={`${styles.edgeGlow} ${styles.edgeGlowPass}`} style={passOverlayStyle} aria-hidden />
										<span className={`${styles.edgeGlow} ${styles.edgeGlowSave}`} style={saveOverlayStyle} aria-hidden />
										<span className={`${styles.edgeGlow} ${styles.edgeGlowApply}`} style={applyOverlayStyle} aria-hidden />
									</>
								) : null}
								{/* Deck covers are the whole viewport — the visible stack loads
								    eagerly. The canonical card is rendered through the shared
								    wrapper so Housing/Meals/Pay/host/Quick-Peek/Pay/Report popups
								    open while swiping; the top card shows the real Skip/Apply/Save
								    row via cardOverrides, behind cards keep no CTA. A drag is
								    swallowed by suppressTap so a swipe-release over a control never
								    opens a popup. */}
								<ListingCard
									listing={listing}
									surface="swipe"
									imageLoading="eager"
									actions={isTop ? undefined : <></>}
									suppressTap={suppressTap}
								/>
							</div>
						);
					})}

					{showAuthGate && (
						<div
							className={styles.authGate}
							role="dialog"
							aria-modal="true"
							aria-label="Sign in to swipe"
							onKeyDown={(e) => {
								if (e.key !== "Tab") return;
								const modal = e.currentTarget;
								const focusable = Array.from(
									modal.querySelectorAll<HTMLElement>(
										'button, a[href], [tabindex]:not([tabindex="-1"])',
									),
								).filter((el) => !el.hasAttribute("disabled"));
								if (focusable.length === 0) return;
								const first = focusable[0];
								const last = focusable[focusable.length - 1];
								if (e.shiftKey && document.activeElement === first) {
									e.preventDefault();
									last?.focus();
								} else if (!e.shiftKey && document.activeElement === last) {
									e.preventDefault();
									first?.focus();
								}
							}}
						>
							<button
								ref={authGateDismissRef}
								className={styles.authGateDismiss}
								onClick={() => setShowAuthGate(false)}
								aria-label="Dismiss"
							>
								<Icon name="action.close" size={16} aria-hidden />
							</button>
							<div className={styles.authGateContent}>
								<Icon name="nav.seek" size={24} aria-hidden />
								<p className={styles.authGateHeading}>Sign in to start swiping</p>
								<p className={styles.authGateBody}>
									Save opportunities, track applications, and get matched with roles that fit your life.
								</p>
								<div className={styles.authGateActions}>
									<Link href="/sign-in" className={styles.authGatePrimary}>Sign in</Link>
									<Link href="/sign-up" className={styles.authGateSecondary}>Create account</Link>
								</div>
							</div>
						</div>
					)}
				</div>
				</ListingCardProvider>

				<button
					type="button"
					className={`${styles.arrow} ${styles.arrowSave}`}
					onClick={() => {
						void triggerLeave("save");
					}}
					disabled={arrowsDisabled}
					aria-label="Save this opportunity"
				>
					<Icon name="action.save" size={24} aria-hidden />
				</button>
				</div>

			{decisionError ? (
				<p className={styles.decisionError} role="alert">
					{decisionError}
				</p>
			) : null}

			{feedback ? (
				<div
					className={feedback === "save" ? `${styles.feedbackToast} ${styles.feedbackSave}` : `${styles.feedbackToast} ${styles.feedbackPass}`}
					role="status"
					aria-live="polite"
				>
					<Icon
						name={feedback === "save" ? "action.save" : "action.close"}
						size={16}
						aria-hidden
					/>
					<span>{feedback === "save" ? "Saved" : "Skipped"}</span>
					<button
						type="button"
						className={styles.feedbackUndo}
						onClick={() => {
							void undo();
						}}
						disabled={Boolean(leaving) || undoing}
					>
						<Icon name="action.back" size={14} aria-hidden />
						Undo
					</button>
				</div>
			) : null}

			{/* Skip / Apply / Save live on the canonical card. Keep Undo separate so
			    every decision remains reversible without duplicating card actions. */}
			<div className={styles.undoDock}>
				<Button
					variant="ghost"
					icon="action.back"
					onClick={() => {
						void undo();
					}}
					disabled={decisions.length === 0 || Boolean(leaving) || undoing}
				>
					Undo
				</Button>
			</div>

			<p className={styles.keyHint}>
				Arrow keys work too: ← skip · → save · ↑ apply · Enter opens ·
				Backspace undoes.
			</p>

			<span className={styles.srOnly} role="status" aria-live="polite">
				{`Opportunity ${index + 1} of ${total}: ${current.title}`}
			</span>

			{popups}
		</div>
	);
}
