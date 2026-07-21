"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@explore-and-earn/ui";

import styles from "./PopupShell.module.css";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PopupShellProps {
	readonly open: boolean;
	readonly onClose: () => void;
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
	/** Prevent dismissal while an in-flight operation must finish atomically. */
	readonly closeDisabled?: boolean;
}

export function PopupShell({
	open,
	onClose,
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
	closeDisabled = false,
}: PopupShellProps) {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	const closeDisabledRef = useRef(closeDisabled);
	onCloseRef.current = onClose;
	closeDisabledRef.current = closeDisabled;
	const [mounted, setMounted] = useState(false);
	// `present` keeps the portal in the DOM through the exit animation after
	// `open` flips to false, so the mirrored close transition can play. The
	// focus trap / scroll lock (below) still release the instant `open` is
	// false, so a11y is unaffected — only the visual teardown is deferred.
	const [present, setPresent] = useState(open);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (open) {
			setPresent(true);
		}
	}, [open]);

	useEffect(() => {
		if (open || !present) {
			return;
		}
		// Closing: hold the portal for one exit cycle, then unmount. Duration is
		// read from the --motion-drawer token (0 under reduced motion) so the
		// timing stays token-driven rather than a hard-coded magic number.
		let exitMs = 320;
		if (typeof window !== "undefined") {
			if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
				exitMs = 0;
			} else {
				const raw = getComputedStyle(document.documentElement)
					.getPropertyValue("--motion-drawer")
					.trim();
				const parsed = Number.parseFloat(raw);
				if (!Number.isNaN(parsed)) {
					exitMs = raw.endsWith("ms") ? parsed : parsed * 1000;
				}
			}
		}
		const timer = window.setTimeout(() => setPresent(false), exitMs);
		return () => window.clearTimeout(timer);
	}, [open, present]);

	useEffect(() => {
		if (!open || !panelRef.current) {
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
				if (!closeDisabledRef.current) {
					event.preventDefault();
					onCloseRef.current();
				}
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
			for (const el of hiddenRoots) {
				el.removeAttribute("aria-hidden");
			}
		};
	}, [open, mounted]);

	if (!mounted || !present) {
		return null;
	}

	// Rendered but no longer open → play the mirrored exit and stay inert.
	const closing = !open;
	const sizeClass =
		size === "compact"
			? styles.compact
			: size === "wide"
				? styles.wide
				: "";

	return createPortal(
		<div
			className={`${styles.scrim}${closing ? ` ${styles.closing}` : ""}`}
			aria-hidden={closing || undefined}
			onClick={(event) => {
				if (
					!closing &&
					!closeDisabled &&
					event.target === event.currentTarget
				) {
					onCloseRef.current();
				}
			}}
		>
			<div
				ref={panelRef}
				className={`${styles.panel}${sizeClass ? ` ${sizeClass}` : ""}${closing ? ` ${styles.closing}` : ""}`}
				role="dialog"
				aria-modal={true}
				aria-labelledby={titleId}
			>
				<div className={styles.handleWrap} aria-hidden>
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
								onClick={onClose}
								aria-label={closeLabel}
								disabled={closeDisabled}
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
