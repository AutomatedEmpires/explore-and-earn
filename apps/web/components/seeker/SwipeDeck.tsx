"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";

import { Button, DiscoveryCard, Icon, Meter } from "@explore-and-earn/ui";

import { EmptyState, toDiscoveryCardData, type DiscoveryListing } from "../discovery";
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

export interface SwipeDeckProps {
	readonly listings: readonly DiscoveryListing[];
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
 * UI-only (Sprint Zero): decisions update local state. No backend, matching
 * algorithm, or persistence — those arrive with the gated data layer.
 */
export function SwipeDeck({ listings }: SwipeDeckProps) {
	const total = listings.length;
	const [index, setIndex] = useState(0);
	const [decisions, setDecisions] = useState<readonly Decision[]>([]);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragging, setDragging] = useState(false);
	const [leaving, setLeaving] = useState<SwipeAction | null>(null);
	const [reducedMotion, setReducedMotion] = useState(false);

	const startRef = useRef<{ x: number; y: number } | null>(null);
	const pointerIdRef = useRef<number | null>(null);
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
		};
	}, []);

	const triggerLeave = useCallback(
		(action: SwipeAction) => {
			if (leaving) {
				return;
			}
			const card = listings[index];
			if (!card) {
				return;
			}
			setDecisions((prev) => [...prev, { id: card.id, action }]);
			setDragging(false);
			setLeaving(action);
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
				},
				reducedMotion ? 0 : THROW_MS,
			);
		},
		[leaving, listings, index, reducedMotion],
	);

	const undo = useCallback(() => {
		if (leaving) {
			return;
		}
		setDecisions((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
		setIndex((value) => Math.max(0, value - 1));
		setOffset({ x: 0, y: 0 });
	}, [leaving]);

	const restart = useCallback(() => {
		setIndex(0);
		setDecisions([]);
		setOffset({ x: 0, y: 0 });
		setLeaving(null);
	}, []);

	const current = listings[index];
	const savedCount = decisions.filter((decision) => decision.action === "save").length;

	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!current) {
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
	const visible = listings.slice(index, index + MAX_VISIBLE);

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
										<Icon name="action.close" size={20} aria-hidden /> Pass
									</span>
									<span className={`${styles.overlay} ${styles.overlaySave}`} style={saveOverlayStyle} aria-hidden>
										<Icon name="action.save" size={20} aria-hidden /> Save
									</span>
									<span className={`${styles.overlay} ${styles.overlayApply}`} style={applyOverlayStyle} aria-hidden>
										<Icon name="action.apply" size={20} aria-hidden /> Apply
									</span>
								</>
							) : null}
							<DiscoveryCard data={toDiscoveryCardData(listing)} surface="swipe" actions={<></>} />
						</div>
					);
				})}
			</div>

			<div className={styles.controls}>
				<Button variant="ghost" icon="action.back" onClick={undo} disabled={decisions.length === 0}>
					Undo
				</Button>
				<Button variant="secondary" icon="action.close" onClick={() => triggerLeave("pass")}>
					Pass
				</Button>
				<Button variant="secondary" icon="action.save" onClick={() => triggerLeave("save")}>
					Save
				</Button>
				<Button variant="primary" icon="action.apply" onClick={() => triggerLeave("apply")}>
					Quick Apply
				</Button>
			</div>

			<p className={styles.hint}>
				Drag a card, tap a button, or use ← Pass · → Save · ↑ Apply · Backspace to undo.
			</p>

			<span className={styles.srOnly} role="status" aria-live="polite">
				{`Opportunity ${index + 1} of ${total}: ${current.title}`}
			</span>
		</div>
	);
}
