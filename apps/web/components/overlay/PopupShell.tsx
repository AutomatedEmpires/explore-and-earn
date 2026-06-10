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
}: PopupShellProps) {
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

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
				event.preventDefault();
				onClose();
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
	}, [open, onClose, mounted]);

	if (!mounted || !open) {
		return null;
	}

	return createPortal(
		<div
			className={styles.scrim}
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div
				ref={panelRef}
				className={
					size === "compact"
						? `${styles.panel} ${styles.compact}`
						: size === "wide"
							? `${styles.panel} ${styles.wide}`
							: styles.panel
				}
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