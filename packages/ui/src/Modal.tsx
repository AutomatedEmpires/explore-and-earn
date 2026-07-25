"use client";

import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";

export interface ModalProps extends PropsWithChildren {
	readonly heading: string;
	/**
	 * Dismiss handler. Wired to Escape and to the scrim. Optional only for
	 * legacy call sites that render their own close control; supplying it is
	 * strongly preferred, because a dialog a keyboard user cannot escape is a
	 * trap.
	 */
	readonly onClose?: () => void;
}

/** Everything focusable inside the surface, in DOM order. */
const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal — a real dialog.
 *
 * This used to be a bare `<div role="dialog" aria-modal="true">` rendered
 * inline, which produced two serious defects on the apply path:
 *
 *  1. `aria-modal="true"` tells assistive tech to treat everything OUTSIDE the
 *     dialog as inert — but focus was never moved INTO it. A screen-reader
 *     seeker who tapped Apply was left with focus on a button the AT had just
 *     been told to ignore: no announcement, nothing reachable. Escape did
 *     nothing and focus was never restored on close.
 *  2. It rendered inline inside the listing page's fixed action bar
 *     (z-index 50), which creates a stacking context — so the dialog was
 *     trapped beneath the mobile bottom-nav dock (z-index 70). On every phone
 *     viewport the nav painted ON TOP of the scrim and stayed tappable, so a
 *     seeker mid-confirmation could navigate away through the "blocked" layer.
 *
 * It now portals to document.body (the placement `--z-overlay: 100` was always
 * documented for: "modal/popup scrims (portal to body)"), moves focus in on
 * mount, cycles Tab within the surface, closes on Escape, and returns focus to
 * whatever opened it.
 */
export function Modal({ children, heading, onClose }: ModalProps) {
	const headingId = useId();
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const openerRef = useRef<Element | null>(null);
	const [mounted, setMounted] = useState(false);

	// createPortal needs a document; render nothing until we are on the client.
	useEffect(() => setMounted(true), []);

	const close = useCallback(() => onClose?.(), [onClose]);

	// Remember the opener, move focus in, and restore it on unmount. Restoring
	// matters as much as trapping: without it, dismissing the dialog drops
	// focus to <body> and a keyboard user restarts from the top of the page.
	useEffect(() => {
		if (!mounted) return;
		openerRef.current = document.activeElement;
		const surface = surfaceRef.current;
		const first = surface?.querySelector<HTMLElement>(FOCUSABLE);
		(first ?? surface)?.focus();
		return () => {
			const opener = openerRef.current;
			if (opener instanceof HTMLElement && document.contains(opener)) {
				opener.focus();
			}
		};
	}, [mounted]);

	useEffect(() => {
		if (!mounted) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.stopPropagation();
				close();
				return;
			}
			if (event.key !== "Tab") return;
			const surface = surfaceRef.current;
			if (!surface) return;
			const focusable = Array.from(
				surface.querySelectorAll<HTMLElement>(FOCUSABLE),
			);
			if (focusable.length === 0) {
				// Nothing to cycle between — keep focus on the surface rather than
				// letting Tab escape into the page the dialog claims to have blocked.
				event.preventDefault();
				surface.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;
			if (event.shiftKey && (active === first || active === surface)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		}
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [mounted, close]);

	if (!mounted) return null;

	return createPortal(
		<div
			aria-labelledby={headingId}
			aria-modal="true"
			className="ui-modal"
			role="dialog"
			onMouseDown={(event) => {
				// Scrim only — a mousedown that started inside the surface must not
				// dismiss when the pointer is released over the backdrop.
				if (event.target === event.currentTarget) close();
			}}
		>
			<div className="ui-modal__surface" ref={surfaceRef} tabIndex={-1}>
				<h2 id={headingId}>{heading}</h2>
				<div>{children}</div>
			</div>
		</div>,
		document.body,
	);
}
