"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@explore-and-earn/ui";

import styles from "./SeekerCoachmarks.module.css";

/**
 * SeekerCoachmarks — D19, applied to the seeker shell.
 *
 * WHAT THIS REPLACED. The seeker shell rendered <OnboardingWalkthrough>: a
 * centred `aria-modal="true"` card with a scrim, a focus trap, a scroll lock,
 * and every sibling of the panel set `aria-hidden`. It described the product in
 * the abstract while making the product unusable — the seeker could not look at
 * the thing being described, because the thing being described was behind a
 * wall. D19 replaces that with coachmarks attached to REAL controls.
 *
 * THREE PROPERTIES, ALL DELIBERATE.
 *
 *   · NOTHING IS BLOCKED. The bubble is `role="dialog" aria-modal="false"`.
 *     There is no scrim, no scroll lock, and nothing outside is hidden from
 *     assistive tech. The page stays fully operable while a mark is showing,
 *     which is the entire point: you are meant to try the control it is
 *     pointing at.
 *
 *   · NOTHING AUTO-OPENS ON A RETURN VISIT. First run offers the tour; after
 *     that it only opens when the seeker asks. A tour that reopens itself is an
 *     obstruction with a friendly voice.
 *
 *   · PROGRESS PERSISTS. The index and the dismissed flag are written to
 *     localStorage on every move, so closing at mark two and coming back later
 *     resumes at mark two rather than restarting.
 *
 * ANCHORING. Each mark names an element id rendered by a real surface. If the
 * target is not on the current page (the seeker is on /messages, the mark points
 * at the dashboard's Saved tile), the bubble DOCKS to the corner and says where
 * the control lives instead of drawing an arrow at nothing.
 *
 * ACCESSIBILITY. Real buttons throughout, a labelled dialog, a polite live
 * region for the step counter, Escape to close, and focus restored to whatever
 * opened it. The target gets `data-coachmark="active"`, which the stylesheet
 * turns into an OUTLINE — an outline rather than only a colour, so the
 * highlight survives forced-colours mode.
 */

const STORAGE_KEY = "ee.seeker.coachmarks.v1";

export interface Coachmark {
	readonly id: string;
	/** DOM id of the real control this mark points at. */
	readonly targetId: string;
	readonly title: string;
	readonly body: string;
	/** Where the control lives, for when the seeker is on another route. */
	readonly whereItLives: string;
}

/**
 * Three marks — the founder brief's set: the discovery modes, Saved, and the
 * profile. Three, not nine: a tour long enough to need a progress bar is a
 * manual, and nobody reads the manual on the way in.
 */
export const SEEKER_COACHMARKS: readonly Coachmark[] = [
	{
		id: "modes",
		targetId: "seeker-mode-seek",
		title: "Three ways to look",
		body: "Seek is search with filters. Swipe is one role at a time. Map is by place. They show the same listings — pick whichever suits your mood.",
		whereItLives: "On your home page, and in the bar at the bottom of the screen.",
	},
	{
		id: "saved",
		targetId: "seeker-glance-saved",
		title: "Saving costs nothing",
		body: "Save anything you might want. Saved roles keep their housing, meals and pay answers, and you can compare them side by side later.",
		whereItLives: "On your home page, and under Saved in the menu.",
	},
	{
		id: "profile",
		targetId: "seeker-nav-profile",
		title: "Your profile does the matching",
		body: "The more of it you fill in, the better the match scores get — and every score can tell you which parts of your profile earned it.",
		whereItLives: "Bottom-right of the screen, and in the menu.",
	},
];

interface Memory {
	readonly index: number;
	/** True once the seeker finished or dismissed the tour. */
	readonly done: boolean;
}

const EMPTY_MEMORY: Memory = { index: 0, done: false };

function readMemory(): Memory {
	if (typeof window === "undefined") return EMPTY_MEMORY;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return EMPTY_MEMORY;
		const parsed = JSON.parse(raw) as Partial<Memory>;
		const index =
			typeof parsed.index === "number" && Number.isFinite(parsed.index)
				? Math.min(Math.max(0, Math.trunc(parsed.index)), SEEKER_COACHMARKS.length - 1)
				: 0;
		return { index, done: parsed.done === true };
	} catch {
		// Private mode, quota, or a value someone else wrote. Start clean rather
		// than throwing inside the shell of every seeker page.
		return EMPTY_MEMORY;
	}
}

function writeMemory(memory: Memory): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
	} catch {
		// Persistence is a convenience; losing it must never break the tour.
	}
}

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SeekerCoachmarks() {
	const pathname = usePathname() ?? "";
	const [open, setOpen] = useState(false);
	const [index, setIndex] = useState(0);
	const [done, setDone] = useState(true); // assume done until memory is read
	const [hydrated, setHydrated] = useState(false);
	const [rect, setRect] = useState<DOMRect | null>(null);
	const bubbleRef = useRef<HTMLDivElement | null>(null);
	const launcherRef = useRef<HTMLButtonElement | null>(null);
	const wantsFocus = useRef(false);

	useEffect(() => {
		const memory = readMemory();
		setIndex(memory.index);
		setDone(memory.done);
		setHydrated(true);
		// First run only: offer the tour by opening it at mark one. Every later
		// visit leaves it closed — see the "nothing auto-opens" note above.
		if (!memory.done && memory.index === 0) {
			setOpen(true);
		}
	}, []);

	const mark = SEEKER_COACHMARKS[index];
	const targetId = open && mark ? mark.targetId : null;

	// Measure the anchor. The target may not be mounted yet (a route push is in
	// flight, the page is streaming), so this retries on animation frames rather
	// than giving up and drawing a floating box over nothing.
	useEffect(() => {
		if (!targetId) {
			setRect(null);
			return;
		}
		let frame = 0;
		let cancelled = false;
		let element: HTMLElement | null = null;
		let last = "";

		function measure() {
			if (cancelled) return;
			const found = targetId ? document.getElementById(targetId) : null;
			if (found) {
				if (found !== element) {
					element?.removeAttribute("data-coachmark");
					element = found;
					element.setAttribute("data-coachmark", "active");
					element.scrollIntoView({
						block: "center",
						behavior: prefersReducedMotion() ? "auto" : "smooth",
					});
				}
				const next = found.getBoundingClientRect();
				// getBoundingClientRect returns a fresh object each frame; committing
				// it unconditionally would re-render the shell sixty times a second
				// for a bubble that is standing still.
				const key = `${Math.round(next.top)}:${Math.round(next.left)}:${Math.round(next.width)}:${Math.round(next.height)}`;
				if (key !== last) {
					last = key;
					setRect(next);
				}
			} else if (last !== "") {
				last = "";
				setRect(null);
			}
			frame = window.requestAnimationFrame(measure);
		}

		frame = window.requestAnimationFrame(measure);
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			element?.removeAttribute("data-coachmark");
		};
	}, [targetId, pathname]);

	useEffect(() => {
		if (open && wantsFocus.current) {
			wantsFocus.current = false;
			bubbleRef.current?.focus();
		}
	}, [open, index]);

	const close = useCallback(
		(markDone: boolean) => {
			setOpen(false);
			setRect(null);
			if (markDone) setDone(true);
			writeMemory({ index, done: markDone || done });
			launcherRef.current?.focus();
		},
		[index, done],
	);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.stopPropagation();
				close(false);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, close]);

	const goTo = useCallback(
		(next: number) => {
			const clamped = Math.min(Math.max(0, next), SEEKER_COACHMARKS.length - 1);
			setIndex(clamped);
			wantsFocus.current = true;
			writeMemory({ index: clamped, done });
		},
		[done],
	);

	const start = useCallback(() => {
		const memory = readMemory();
		// A finished tour replays from the start; an abandoned one resumes.
		const at = memory.done ? 0 : memory.index;
		setIndex(at);
		wantsFocus.current = true;
		setOpen(true);
	}, []);

	const anchorStyle = useMemo<CSSProperties | undefined>(() => {
		if (!rect) return undefined;
		return {
			"--cm-top": `${Math.round(rect.bottom)}px`,
			"--cm-left": `${Math.round(rect.left + rect.width / 2)}px`,
		} as CSSProperties;
	}, [rect]);

	// Render nothing until memory is read, so a returning seeker never sees the
	// launcher flash into a tour they already finished.
	if (!hydrated) return null;

	const isLast = index === SEEKER_COACHMARKS.length - 1;

	return (
		<>
			<button
				ref={launcherRef}
				type="button"
				className={styles.launcher}
				onClick={start}
				aria-expanded={open}
			>
				<Icon name="system.info" size={16} aria-hidden />
				{done ? "Replay the quick tour" : index > 0 ? `Resume tour · ${index + 1} of ${SEEKER_COACHMARKS.length}` : "Take a quick tour"}
			</button>

			{open && mark ? (
				<div
					ref={bubbleRef}
					className={styles.bubble}
					data-placement={rect ? "anchored" : "docked"}
					style={anchorStyle}
					role="dialog"
					/* NOT modal, and that is the design: the control this bubble points
					   at must stay usable while the bubble explains it. */
					aria-modal="false"
					aria-labelledby="seeker-coachmark-title"
					aria-describedby="seeker-coachmark-body"
					tabIndex={-1}
				>
					<div className={styles.top}>
						<p className={styles.step} aria-live="polite">
							{index + 1} of {SEEKER_COACHMARKS.length}
						</p>
						<button
							type="button"
							className={styles.close}
							onClick={() => close(false)}
							aria-label="Close the tour"
						>
							<Icon name="action.close" size={18} aria-hidden />
						</button>
					</div>

					<h2 id="seeker-coachmark-title" className={styles.title}>
						{mark.title}
					</h2>
					<p id="seeker-coachmark-body" className={styles.body}>
						{mark.body}
					</p>
					{!rect ? (
						<p className={styles.where}>
							<Icon name="system.info" size={14} aria-hidden />
							{mark.whereItLives}
						</p>
					) : null}

					<div className={styles.actions}>
						<button
							type="button"
							className={styles.back}
							onClick={() => goTo(index - 1)}
							disabled={index === 0}
						>
							Back
						</button>
						{isLast ? (
							<button type="button" className={styles.next} onClick={() => close(true)}>
								Done
								<Icon name="system.success" size={16} aria-hidden />
							</button>
						) : (
							<button type="button" className={styles.next} onClick={() => goTo(index + 1)}>
								Next
								<Icon name="action.forward" size={16} aria-hidden />
							</button>
						)}
					</div>
				</div>
			) : null}
		</>
	);
}
