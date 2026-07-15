"use client";

import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./OnboardingWalkthrough.module.css";

/**
 * OnboardingWalkthrough — a dismissible, skippable, keyboard-accessible
 * step-by-step site-nav tour with helper tips. Rendered inside the seeker and
 * host shells (never in app/layout.tsx — the PWA agent owns that).
 *
 * Design: a lightweight centered modal-tour (founder canon — "menus + popups
 * center in the device screen, never hang off the left edge"), not fragile
 * element-anchored coach-marks. One glassy Glacier-tokened card walks the user
 * through where things live: find/post listings → housing·meals·pay + the
 * popups → apply/invite/dashboard.
 *
 * Accessibility: role="dialog" + aria-modal, focus trap, Esc to close, arrow
 * keys to page steps, scroll-lock, sibling aria-hidden, and focus restoration —
 * mirroring the ScopeShellNav drawer contract. Respects reduced motion via CSS.
 *
 * Persistence (localStorage + sessionStorage, SSR-safe):
 *   - "Don't show again" / finishing the tour  → localStorage flag (permanent;
 *     hides the launcher too).
 *   - "Skip" / Esc without the checkbox        → sessionStorage snooze (won't
 *     re-pop this session, but the launcher stays for later).
 *
 * Prominence: hosts pass `autoStart` (the tour opens itself on first visit);
 * seekers leave it off and get only the subtle "Take a quick tour" launcher.
 */

export interface WalkthroughStep {
	/** Registry icon key for the step medallion (<Icon> only — guardrail G30). */
	readonly icon: IconKey;
	/** Short step heading. */
	readonly title: string;
	/** One or two sentences of helper copy. */
	readonly body: string;
	/** Optional deep link the step points at (e.g. "/host/listings/new"). */
	readonly href?: string;
	/** Label for the optional link (defaults to "Open"). */
	readonly hrefLabel?: string;
}

export interface OnboardingWalkthroughProps {
	/**
	 * Unique, versioned persistence key for this tour, e.g.
	 * "ee.onboarding.host.v1". Bump the version to re-surface after a redesign.
	 */
	readonly storageKey: string;
	/** Ordered tour steps. */
	readonly steps: ReadonlyArray<WalkthroughStep>;
	/** Eyebrow label above the title (e.g. "Host tour"). */
	readonly eyebrow: string;
	/** Overall tour heading shown in the card header. */
	readonly title: string;
	/**
	 * Open automatically on first mount (host = true for prominence). Seekers
	 * leave this off and rely on the launcher pill.
	 */
	readonly autoStart?: boolean;
	/** Launcher pill label. Defaults to "Take a quick tour". */
	readonly launcherLabel?: string;
}

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function readDismissed(storageKey: string): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(storageKey) === "dismissed";
	} catch {
		return false;
	}
}

function readSnoozed(storageKey: string): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.sessionStorage.getItem(`${storageKey}.snooze`) === "1";
	} catch {
		return false;
	}
}

export function OnboardingWalkthrough({
	storageKey,
	steps,
	eyebrow,
	title,
	autoStart = false,
	launcherLabel = "Take a quick tour",
}: OnboardingWalkthroughProps) {
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const [index, setIndex] = useState(0);
	const [dontShow, setDontShow] = useState(false);

	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);

	const headingId = useId();
	const bodyId = useId();

	const total = steps.length;
	const step = steps[index];
	const isLast = index === total - 1;
	const isFirst = index === 0;

	// Mount gate (portal + storage reads only run client-side, no SSR mismatch).
	useEffect(() => {
		setMounted(true);
		const already = readDismissed(storageKey);
		setDismissed(already);
		if (!already && autoStart && !readSnoozed(storageKey)) {
			setOpen(true);
		}
	}, [storageKey, autoStart]);

	const persistDismissed = useCallback(() => {
		try {
			window.localStorage.setItem(storageKey, "dismissed");
		} catch {
			/* storage unavailable — nothing to persist, tour just re-appears */
		}
	}, [storageKey]);

	const persistSnooze = useCallback(() => {
		try {
			window.sessionStorage.setItem(`${storageKey}.snooze`, "1");
		} catch {
			/* no-op */
		}
	}, [storageKey]);

	const startTour = useCallback(() => {
		setIndex(0);
		setOpen(true);
	}, []);

	// Close the tour. `permanent` (finish or "don't show again") hides the
	// launcher for good; otherwise we only snooze it for this session.
	const closeTour = useCallback(
		(permanent: boolean) => {
			setOpen(false);
			if (permanent) {
				persistDismissed();
				setDismissed(true);
			} else {
				persistSnooze();
			}
		},
		[persistDismissed, persistSnooze],
	);

	const goNext = useCallback(() => {
		setIndex((current) => {
			if (current >= total - 1) {
				return current;
			}
			return current + 1;
		});
	}, [total]);

	const goPrev = useCallback(() => {
		setIndex((current) => (current <= 0 ? current : current - 1));
	}, []);

	const handleNext = useCallback(() => {
		if (isLast) {
			closeTour(true);
			return;
		}
		goNext();
	}, [isLast, closeTour, goNext]);

	// Focus trap + Esc + arrow paging + scroll lock + sibling aria-hidden.
	useEffect(() => {
		if (!open || !panelRef.current) {
			return;
		}
		restoreFocusRef.current = document.activeElement as HTMLElement | null;
		const panel = panelRef.current;
		const focusables = () =>
			Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
		focusables()[0]?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeTour(dontShow);
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				goNext();
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				goPrev();
				return;
			}
			if (event.key !== "Tab") {
				return;
			}
			const items = focusables();
			if (items.length === 0) {
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		const hiddenRoots: Element[] = [];
		for (const child of Array.from(document.body.children)) {
			if (!child.contains(panel)) {
				child.setAttribute("aria-hidden", "true");
				hiddenRoots.push(child);
			}
		}

		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = previousOverflow;
			restoreFocusRef.current?.focus();
			for (const element of hiddenRoots) {
				element.removeAttribute("aria-hidden");
			}
		};
	}, [open, dontShow, closeTour, goNext, goPrev]);

	const dots = useMemo(
		() => Array.from({ length: total }, (_, i) => i),
		[total],
	);

	if (!mounted || dismissed || total === 0) {
		return null;
	}

	return (
		<>
			{/* Launcher — always available while the tour isn't dismissed. For hosts
			    the tour also auto-opens; seekers reach it only through this pill. */}
			{!open ? (
				<button
					type="button"
					className={`${styles.launcher} ui-pressable`}
					onClick={startTour}
					aria-haspopup="dialog"
				>
					<Icon name="nav.help" size={20} aria-hidden />
					<span className={styles.launcherLabel}>{launcherLabel}</span>
				</button>
			) : null}

			{open
				? createPortal(
						<div
							className={styles.scrim}
							onClick={(event) => {
								if (event.target === event.currentTarget) {
									closeTour(dontShow);
								}
							}}
						>
							<div
								ref={panelRef}
								className={styles.card}
								role="dialog"
								aria-modal={true}
								aria-labelledby={headingId}
								aria-describedby={bodyId}
							>
								<div className={styles.header}>
									<div className={styles.headText}>
										<span className={styles.eyebrow}>{eyebrow}</span>
										<h2 id={headingId} className={styles.title}>
											{title}
										</h2>
									</div>
									<button
										type="button"
										className={styles.close}
										onClick={() => closeTour(dontShow)}
										aria-label="Close tour"
									>
										<Icon name="action.close" size={20} aria-hidden />
									</button>
								</div>

								<div className={styles.stepBody}>
									<span className={styles.medallion} aria-hidden>
										<Icon name={step.icon} size={24} weight="fill" aria-hidden />
									</span>
									<div>
										<p className={styles.stepCount}>
											Step {index + 1} of {total}
										</p>
										<h3 className={styles.stepTitle}>{step.title}</h3>
										<p id={bodyId} className={styles.stepText}>
											{step.body}
										</p>
										{step.href ? (
											<Link
												href={step.href}
												className={styles.stepLink}
												onClick={() => closeTour(dontShow)}
											>
												{step.hrefLabel ?? "Open"}
												<Icon name="action.forward" size={16} aria-hidden />
											</Link>
										) : null}
									</div>
								</div>

								<div
									className={styles.dots}
									role="tablist"
									aria-label="Tour progress"
								>
									{dots.map((i) => (
										<button
											key={i}
											type="button"
											role="tab"
											aria-selected={i === index}
											aria-label={`Go to step ${i + 1}`}
											className={styles.dot}
											data-active={i === index ? "true" : undefined}
											data-done={i < index ? "true" : undefined}
											onClick={() => setIndex(i)}
										/>
									))}
								</div>

								<div className={styles.footer}>
									<label className={styles.dontShow}>
										<input
											type="checkbox"
											checked={dontShow}
											onChange={(event) => setDontShow(event.target.checked)}
										/>
										Don&apos;t show again
									</label>
									<div className={styles.actions}>
										<button
											type="button"
											className={`${styles.btn} ${styles.ghost}`}
											onClick={() => closeTour(dontShow)}
										>
											Skip
										</button>
										{!isFirst ? (
											<button
												type="button"
												className={`${styles.btn} ${styles.secondary}`}
												onClick={goPrev}
											>
												Back
											</button>
										) : null}
										<button
											type="button"
											className={`${styles.btn} ${styles.primary}`}
											onClick={handleNext}
										>
											{isLast ? "Finish" : "Next"}
										</button>
									</div>
								</div>
							</div>
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
