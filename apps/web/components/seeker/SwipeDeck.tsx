"use client";

import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, DiscoveryCard, Icon, Meter } from "@explore-and-earn/ui";

import {
	DiscoveryCardSkeleton,
	EmptyState,
	toDiscoveryCardData,
	type DiscoveryListing,
} from "../discovery";
import {
	getSwipeBatchAction,
	passListingAction,
	saveListingAction,
	unpassListingAction,
} from "../../app/actions/swipe";
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
/** Top card + cards peeking behind it. */
const MAX_VISIBLE = 3;
/** Prefetch the next page once the deck has this many (or fewer) cards left. */
const PREFETCH_REMAINING = 5;

export interface SwipeDeckProps {
	readonly listings: readonly DiscoveryListing[];
	/** published_at of the last server row, or null when there is no next page. */
	readonly initialCursor?: string | null;
	/** False for unauthenticated visitors — shows the first card but gates all swipe actions. */
	readonly isAuthenticated?: boolean;
}

/**
 * SwipeDeck — the /swipe surface. A true swipe experience built on the SINGLE
 * canonical DiscoveryCard ("swipe" surface, product-principles #2/#6): drag to
 * throw, a peeking card stack, text-labeled Pass/Save/Apply overlays, full
 * keyboard control, undo/rewind, and a NEUTRAL match Meter (the card hides its
 * Meter off the "matched" surface, so the deck surfaces it here).
 *
 * "Better than Tinder" for this product means values-first (Housing/Meals/Pay
 * always on the card), match shown neutrally (never red/green good-bad), and a
 * no-cost Undo — zero dark patterns. Motion uses design-system tokens and fully
 * honors prefers-reduced-motion.
 *
 * Infinite load: the deck seeds from the server-fetched first batch, then
 * pre-fetches the next page (getSwipeBatchAction) once PREFETCH_REMAINING cards
 * remain, appending de-duplicated rows and advancing the cursor until the feed
 * is exhausted (nextCursor === null).
 *
 * Persistence: decisions update local state, and a swipe-right / Save is
 * additionally persisted best-effort via the saveListingAction server action
 * (failures are swallowed so the deck never blocks). Pass/apply persistence and
 * the match algorithm still arrive with the gated data layer.
 */
export function SwipeDeck({ listings, initialCursor = null, isAuthenticated = true }: SwipeDeckProps) {
	const router = useRouter();
	const [deck, setDeck] = useState<DiscoveryListing[]>(() => [...listings]);
	const [cursor, setCursor] = useState<string | null>(initialCursor);
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const total = deck.length;
	const [index, setIndex] = useState(0);
	const [decisions, setDecisions] = useState<readonly Decision[]>([]);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragging, setDragging] = useState(false);
	const [leaving, setLeaving] = useState<SwipeAction | null>(null);
	const [reducedMotion, setReducedMotion] = useState(false);
	const [feedback, setFeedback] = useState<"pass" | "save" | null>(null);

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
				const merged = [...prev];
				for (const listing of batch.listings) {
					if (!seen.has(listing.id)) {
						merged.push(listing);
					}
				}
				return merged;
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
		const remaining = deck.length - index;
		if (remaining <= PREFETCH_REMAINING && cursor !== null && !loadingRef.current) {
			void loadMore();
		}
	}, [index, deck.length, cursor, loadMore]);

	const triggerLeave = useCallback(
		(action: SwipeAction) => {
			if (!isAuthenticated) {
				setShowAuthGate(true);
				return;
			}
			if (leaving) {
				return;
			}
			const card = deck[index];
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
				feedbackTimer.current = setTimeout(() => setFeedback(null), reducedMotion ? 0 : 900);
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
		[leaving, deck, index, reducedMotion, router],
	);

	const undo = useCallback(() => {
		if (!isAuthenticated || leaving) {
			return;
		}
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

	const current = deck[index];
	const savedCount = decisions.filter((decision) => decision.action === "save").length;

	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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

	if (!current) {
		// More pages are still in flight (or queued): show skeleton slots rather
		// than the terminal empty state, so a mid-deck refill doesn't flash
		// "all caught up".
		if (loadingMore || cursor !== null) {
			return (
				<div className={styles.deck} aria-busy="true">
					<p className={styles.progress}>Finding more opportunities…</p>
					<div className={styles.stack}>
						<DiscoveryCardSkeleton />
						<DiscoveryCardSkeleton />
						<DiscoveryCardSkeleton />
					</div>
				</div>
			);
		}
		if (loadError) {
			return (
				<div className={styles.deck}>
					<EmptyState
						title="Couldn't load more"
						message="There was a problem fetching the next batch of opportunities. Try again or browse the full feed under Seek."
					/>
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
		const summary =
			savedCount > 0
				? `You saved ${savedCount} ${savedCount === 1 ? "opportunity" : "opportunities"}. Find them under Saved, or run the deck again.`
				: "You've reviewed every opportunity in the deck. Start over, or browse the full feed under Seek.";
		return (
			<div className={styles.deck}>
				<EmptyState title="You're all caught up" message={summary} />
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
	const visible = deck.slice(index, index + MAX_VISIBLE);

	return (
		<div
			className={styles.deck}
			role="group"
			aria-roledescription="Swipe deck"
			aria-label="Opportunities"
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<p className={styles.progress}>
				Opportunity {index + 1} of {total}
			</p>

			{typeof current.matchScore === "number" ? (
				<Meter value={current.matchScore} label="Match" />
			) : null}

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
					{feedback === "save" ? "Saved" : "Skipped"}
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

			<p className={styles.hint}>
				Drag a card, tap a button, or use ← Skip · → Save · ↑ Apply · Backspace to undo.
			</p>

			<span className={styles.srOnly} role="status" aria-live="polite">
				{`Opportunity ${index + 1} of ${total}: ${current.title}`}
			</span>
		</div>
	);
}
