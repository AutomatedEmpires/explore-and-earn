"use client";

import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type AnimationEvent as ReactAnimationEvent,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@explore-and-earn/ui";

import { popupDismissalAllowed } from "./popupDismissal";
import styles from "./PopupShell.module.css";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SWIPE_DISMISS_THRESHOLD_PX = 96;

export interface PopupShellProps {
	readonly open: boolean;
	readonly onClose: () => void;
	/** Synchronous preflight. Return false to keep the dialog fully open. */
	readonly onBeforeClose?: () => boolean;
	readonly title: string;
	readonly headerIcon?: ReactNode;
	readonly eyebrow?: ReactNode;
	readonly headerMeta?: ReactNode;
	readonly headerTags?: ReactNode;
	readonly headerActions?: ReactNode;
	readonly hero?: ReactNode;
	readonly heroFooter?: ReactNode;
	readonly children: ReactNode;
	readonly footer?: ReactNode;
	readonly size?: "compact" | "standard" | "wide";
	readonly closeLabel?: string;
}

export function PopupShell({
	open,
	onClose,
	onBeforeClose,
	title,
	headerIcon,
	eyebrow,
	headerMeta,
	headerTags,
	headerActions,
	hero,
	heroFooter,
	children,
	footer,
	size = "standard",
	closeLabel = "Close",
}: PopupShellProps) {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const beforeCloseRef = useRef(onBeforeClose);
	const closeRequestedRef = useRef(false);
	const closingRef = useRef(false);
	const dragStartRef = useRef<{ readonly pointerId: number; readonly y: number } | null>(
		null,
	);
	const dragOffsetRef = useRef(0);
	const [mounted, setMounted] = useState(false);
	const [rendered, setRendered] = useState(false);
	const [closing, setClosing] = useState(false);
	const [entered, setEntered] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [dragOffset, setDragOffset] = useState(0);
	beforeCloseRef.current = onBeforeClose;

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (open) {
			closeRequestedRef.current = false;
			closingRef.current = false;
			dragOffsetRef.current = 0;
			setClosing(false);
			setEntered(false);
			setDragging(false);
			setDragOffset(0);
			setRendered(true);
			return;
		}

		if (rendered && !closingRef.current) {
			closingRef.current = true;
			setDragging(false);
			setClosing(true);
		}
	}, [open, rendered]);

	const requestClose = useCallback(() => {
		if (closingRef.current) return;
		if (!popupDismissalAllowed(beforeCloseRef.current)) {
			closeRequestedRef.current = false;
			dragStartRef.current = null;
			dragOffsetRef.current = 0;
			setDragging(false);
			setDragOffset(0);
			return;
		}
		closeRequestedRef.current = true;
		closingRef.current = true;
		setDragging(false);
		setClosing(true);
	}, []);

	const finishClose = useCallback(() => {
		if (!closingRef.current) return;
		const shouldNotify = closeRequestedRef.current;
		closeRequestedRef.current = false;
		closingRef.current = false;
		dragStartRef.current = null;
		dragOffsetRef.current = 0;
		setDragOffset(0);
		setDragging(false);
		setClosing(false);
		setEntered(false);
		setRendered(false);
		if (shouldNotify) onClose();
	}, [onClose]);

	useEffect(() => {
		if (!rendered || !panelRef.current) {
			return;
		}

		restoreFocusRef.current = document.activeElement as HTMLElement | null;
		const panel = panelRef.current;
		const focusables = () =>
			panel
				? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
				: [];
		focusables()[0]?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				requestClose();
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

		// Hide all sibling body children from screen readers so the modal is the
		// only reachable region (ARIA modal dialog spec).
		const hiddenRoots: Array<{
			readonly element: Element;
			readonly previousValue: string | null;
		}> = [];
		for (const child of Array.from(document.body.children)) {
			if (!child.contains(panel)) {
				const previousValue = child.getAttribute("aria-hidden");
				child.setAttribute("aria-hidden", "true");
				hiddenRoots.push({ element: child, previousValue });
			}
		}

		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = previousOverflow;
			restoreFocusRef.current?.focus();
			for (const { element, previousValue } of hiddenRoots) {
				if (previousValue === null) element.removeAttribute("aria-hidden");
				else element.setAttribute("aria-hidden", previousValue);
			}
		};
	}, [rendered, requestClose]);

	function handleAnimationEnd(event: ReactAnimationEvent<HTMLDivElement>) {
		if (event.target !== event.currentTarget) return;
		if (closingRef.current) finishClose();
		else setEntered(true);
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (closingRef.current || event.button !== 0) return;
		dragStartRef.current = { pointerId: event.pointerId, y: event.clientY };
		dragOffsetRef.current = 0;
		setDragging(true);
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		const start = dragStartRef.current;
		if (!start || start.pointerId !== event.pointerId) return;
		const offset = Math.max(0, event.clientY - start.y);
		dragOffsetRef.current = offset;
		setDragOffset(offset);
	}

	function finishPointerGesture(
		event: ReactPointerEvent<HTMLDivElement>,
		cancelled = false,
	) {
		const start = dragStartRef.current;
		if (!start || start.pointerId !== event.pointerId) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		dragStartRef.current = null;
		setDragging(false);
		if (!cancelled && dragOffsetRef.current >= SWIPE_DISMISS_THRESHOLD_PX) {
			requestClose();
			return;
		}
		dragOffsetRef.current = 0;
		setDragOffset(0);
	}

	if (!mounted || !rendered) {
		return null;
	}

	return createPortal(
			<div
				className={
					closing ? `${styles.scrim} ${styles.scrimClosing}` : styles.scrim
				}
				onClick={(event) => {
					if (event.target === event.currentTarget) {
						requestClose();
					}
			}}
		>
			<div
				ref={panelRef}
					className={[
						styles.panel,
						size === "compact"
							? styles.compact
							: size === "wide"
								? styles.wide
								: "",
						closing ? styles.panelClosing : "",
						dragging ? styles.panelDragging : "",
						entered && !closing && !dragging ? styles.panelEntered : "",
					]
						.filter(Boolean)
						.join(" ")}
					style={
						dragOffset > 0
							? ({
									"--popup-drag-offset": `${dragOffset}px`,
									transform: "translateY(var(--popup-drag-offset))",
								} as CSSProperties)
							: undefined
					}
					role="dialog"
					aria-modal={true}
					aria-labelledby={titleId}
					data-state={closing ? "closing" : "open"}
					onAnimationEnd={handleAnimationEnd}
				>
					<div
						className={styles.handleWrap}
						data-popup-drag-handle
						aria-hidden
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={(event) => finishPointerGesture(event)}
						onPointerCancel={(event) => finishPointerGesture(event, true)}
					>
					<span className={styles.handle} />
				</div>
				<div className={styles.chrome}>
					<div className={styles.topbar}>
						<div className={styles.headingWrap}>
							{headerIcon ? (
								<div className={styles.headerIcon}>{headerIcon}</div>
							) : null}
							<div className={styles.headingText}>
								{eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
								<h2 id={titleId} className={styles.title}>
									{title}
								</h2>
								{headerMeta ? <div className={styles.meta}>{headerMeta}</div> : null}
							</div>
						</div>
						<div className={styles.topbarActions}>
							{headerActions ? (
								<div className={styles.actionGroup}>{headerActions}</div>
							) : null}
							<button
								type="button"
								className={styles.closeButton}
									onClick={requestClose}
								aria-label={closeLabel}
							>
								<Icon name="action.close" size={20} aria-hidden />
							</button>
						</div>
					</div>
					{headerTags ? <div className={styles.tags}>{headerTags}</div> : null}
				</div>

				<div className={styles.body}>
					{hero ? (
						<div className={styles.heroWrap}>
							<div className={styles.hero}>{hero}</div>
							{heroFooter ? <div className={styles.heroFooter}>{heroFooter}</div> : null}
						</div>
					) : null}
					<div className={styles.content}>{children}</div>
					{footer ? <div className={styles.footer}>{footer}</div> : null}
				</div>
			</div>
		</div>,
		document.body,
	);
}
