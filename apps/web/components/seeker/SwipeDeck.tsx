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
import { Button, DiscoveryCard, Icon } from "@explore-and-earn/ui";

import {
	CATEGORY_ICON,
	CATEGORY_LABEL,
	DiscoveryCardSkeleton,
	EmptyState,
	toDiscoveryCardData,
	type DiscoveryListing,
} from "../discovery";
import { SeekFilterPopup, type SeekFilterPopupValue } from "./SeekFilterPopup";
import { SeekSortPopup } from "./SeekSortPopup";
import {
	getSwipeBatchAction,
	passListingAction,
	saveListingAction,
	unpassListingAction,
} from "../../app/actions/swipe";
import { byMonetization } from "../../lib/ranking";
import styles from "./SwipeDeck.module.css";

type SwipeAction = "pass" | "save" | "apply";

interface Decision {
	readonly id: string;
	readonly action: SwipeAction;
}

/** Drag distance (px) past which a release commits the swipe. */
const COMMIT_DISTANCE = 120;
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
 * SINGLE canonical DiscoveryCard ("swipe" surface, which renders no CTA — the
 * card is entirely gesture-driven). The page around it is stripped to just the
 * card: drag to throw, a peeking stack, edge-glow / labeled overlays that scale
 * with the drag, flanking arrow controls on ≥768, full keyboard control, a
 * confirm toast with one-tap Undo, and in-place Sort / Filter (the same popups
 * /seek uses). Motion honors prefers-reduced-motion.
 *
 * "Better than Tinder" here means values-first (Housing/Meals/Pay always on the
 * card), match shown neutrally by the card itself, and a no-cost Undo — zero
 * dark patterns.
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
 * Persistence: a Save is persisted best-effort via saveListingAction and a Pass
 * via passListingAction (failures are swallowed so the gesture never blocks);
 * Undo of a pass rolls back the persisted pass.
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

	// Sort / filter — client-side over the loaded deck. `lane` is the SeekSortPopup
	// category; `filters` is the SeekFilterPopup value.
	const [lane, setLane] = useState<OpportunityCategory | null>(null);
	const [filters, setFilters] = useState<SeekFilterPopupValue>(EMPTY_FILTERS);
	const [sortOpen, setSortOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);

	const [showAuthGate, setShowAuthGate] = useState(false);

	const startRef = useRef<{ x: number; y: number } | null>(null);
	const pointerIdRef = useRef<number | null>(null);
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const deckRef = useRef<DiscoveryListing[]>(deck);
	const loadingRef = useRef(false);
	const authGateDismissRef = useRef<HTMLButtonElement | null>(null);
	const preGateFocusRef = useRef<HTMLElement | null>(null);

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
		(action: SwipeAction) => {
			if (!isAuthenticated) {
				setShowAuthGate(true);
				return;
			}
			if (leaving) {
				return;
			}
			const card = view[index];
			if (!card) {
				return;
			}
			if (action === "save") {
				// Persist the save without blocking the swipe animation. Best-effort:
				// a failure (e.g. the seeker has no profile row yet) is intentionally
				// swallowed so the gesture/animation is never interrupted.
				startTransition(() => {
					void saveListingAction(card.id).catch(() => {
						/* best-effort; saving must never block the swipe UX */
					});
				});
			}
			if (action === "pass") {
				// Persist the pass (057) so this card never resurfaces in a later
				// session — a pass is a real preference signal. Same best-effort
				// contract as Save.
				startTransition(() => {
					void passListingAction(card.id).catch(() => {
						/* best-effort; passing must never block the swipe UX */
					});
				});
			}
			setDecisions((prev) => [...prev, { id: card.id, action }]);
			setDragging(false);
			setLeaving(action);
			if (action === "pass" || action === "save") {
				setFeedback(action);
				if (feedbackTimer.current) {
					clearTimeout(feedbackTimer.current);
				}
				feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
			}
			setOffset(
				action === "apply"
					? { x: 0, y: -720 }
					: { x: action === "save" ? 720 : -720, y: 0 },
			);
			if (leaveTimer.current) {
				clearTimeout(leaveTimer.current);
			}
			leaveTimer.current = setTimeout(
				() => {
					setIndex((value) => value + 1);
					setOffset({ x: 0, y: 0 });
					setLeaving(null);
					if (action === "apply") {
						router.push(`/listing/${card.id}`);
					}
				},
				reducedMotion ? 0 : THROW_MS,
			);
		},
		[isAuthenticated, leaving, view, index, reducedMotion, router],
	);

	const undo = useCallback(() => {
		if (!isAuthenticated || leaving) {
			return;
		}
		if (feedbackTimer.current) {
			clearTimeout(feedbackTimer.current);
		}
		setFeedback(null);
		setDecisions((prev) => {
			const last = prev[prev.length - 1];
			// Undoing a pass removes the persisted pass so the card can
			// resurface in future decks (best-effort, mirrors the write).
			if (last?.action === "pass") {
				void unpassListingAction(last.id).catch(() => {
					/* best-effort */
				});
			}
			return prev.length === 0 ? prev : prev.slice(0, -1);
		});
		setIndex((value) => Math.max(0, value - 1));
		setOffset({ x: 0, y: 0 });
	}, [isAuthenticated, leaving]);

	const restart = useCallback(() => {
		setIndex(0);
		setDecisions([]);
		setOffset({ x: 0, y: 0 });
		setLeaving(null);
	}, []);

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
	const filterCount =
		(filters.housing ? 1 : 0) +
		(filters.meals ? 1 : 0) +
		(filters.visaSupport ? 1 : 0) +
		(filters.payMin && filters.payMin > 0 ? 1 : 0) +
		(filters.startRangeMonths ? 1 : 0);
	const controlsActive = filterCount > 0 || lane !== null;

	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (sortOpen || filterOpen || showAuthGate) {
			return;
		}
		if (!current) {
			return;
		}
		if (!isAuthenticated) {
			setShowAuthGate(true);
			return;
		}
		switch (event.key) {
			case "ArrowLeft":
				event.preventDefault();
				triggerLeave("pass");
				break;
			case "ArrowRight":
				event.preventDefault();
				triggerLeave("save");
				break;
			case "ArrowUp":
				event.preventDefault();
				triggerLeave("apply");
				break;
			case "Backspace":
				event.preventDefault();
				undo();
				break;
			default:
				break;
		}
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!isAuthenticated) {
			setShowAuthGate(true);
			return;
		}
		if (leaving || !current) {
			return;
		}
		pointerIdRef.current = event.pointerId;
		startRef.current = { x: event.clientX, y: event.clientY };
		setDragging(true);
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging || !startRef.current) {
			return;
		}
		setOffset({
			x: event.clientX - startRef.current.x,
			y: event.clientY - startRef.current.y,
		});
	};

	const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging) {
			return;
		}
		if (pointerIdRef.current !== null) {
			try {
				event.currentTarget.releasePointerCapture(pointerIdRef.current);
			} catch {
				/* pointer already released */
			}
		}
		pointerIdRef.current = null;
		startRef.current = null;
		const { x, y } = offset;
		if (x > COMMIT_DISTANCE) {
			triggerLeave("save");
			return;
		}
		if (x < -COMMIT_DISTANCE) {
			triggerLeave("pass");
			return;
		}
		if (y < -COMMIT_DISTANCE) {
			triggerLeave("apply");
			return;
		}
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
				aria-haspopup="dialog"
			>
				<Icon name={lane ? CATEGORY_ICON[lane] : "action.sort"} size={16} aria-hidden />
				<span className={styles.toolLabel}>{lane ? CATEGORY_LABEL[lane] : "Sort"}</span>
			</button>
			<button
				type="button"
				className={filterCount > 0 ? `${styles.tool} ${styles.toolActive}` : styles.tool}
				onClick={() => setFilterOpen(true)}
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
	const arrowsDisabled = Boolean(leaving);

	return (
		<div
			className={styles.deck}
			role="group"
			aria-roledescription="Swipe deck"
			aria-label="Opportunities"
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
					onClick={() => triggerLeave("pass")}
					disabled={arrowsDisabled}
					aria-label="Skip this opportunity"
				>
					<Icon name="action.close" size={24} aria-hidden />
				</button>

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
									touchAction: "none",
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
								onPointerCancel={isTop ? onPointerEnd : undefined}
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
								{/* Deck covers are the whole viewport — the visible stack loads eagerly. */}
								<DiscoveryCard data={toDiscoveryCardData(listing)} surface="swipe" actions={<></>} imageLoading="eager" />
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

				<button
					type="button"
					className={`${styles.arrow} ${styles.arrowSave}`}
					onClick={() => triggerLeave("save")}
					disabled={arrowsDisabled}
					aria-label="Save this opportunity"
				>
					<Icon name="action.save" size={24} aria-hidden />
				</button>
			</div>

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
					<button type="button" className={styles.feedbackUndo} onClick={undo}>
						<Icon name="action.back" size={14} aria-hidden />
						Undo
					</button>
				</div>
			) : null}

			<div className={styles.controls}>
				<Button variant="ghost" icon="action.back" onClick={undo} disabled={decisions.length === 0}>
					Undo
				</Button>
				<Button variant="secondary" icon="action.close" onClick={() => triggerLeave("pass")}>
					Skip
				</Button>
				<Button variant="secondary" icon="action.save" onClick={() => triggerLeave("save")}>
					Save
				</Button>
				<Button variant="primary" icon="action.apply" onClick={() => triggerLeave("apply")}>
					Quick Apply
				</Button>
			</div>

			<span className={styles.srOnly} role="status" aria-live="polite">
				{`Opportunity ${index + 1} of ${total}: ${current.title}`}
			</span>

			{popups}
		</div>
	);
}
