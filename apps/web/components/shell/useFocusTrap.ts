"use client";

import { useEffect, type RefObject } from "react";

// useFocusTrap — keeps keyboard focus within `containerRef` while `active`.
// On activation, focus moves to the first focusable element; on deactivation,
// focus is restored to the element that was focused beforehand. Part of the
// app-shell overlay accessibility contract (docs/ux/modal-sheet-system.md).

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"textarea:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

export function useFocusTrap<T extends HTMLElement>(
	containerRef: RefObject<T | null>,
	active: boolean,
): void {
	useEffect(() => {
		if (!active) return;
		const container = containerRef.current;
		if (!container) return;

		const previouslyFocused = document.activeElement as HTMLElement | null;

		const getFocusable = (): HTMLElement[] =>
			Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
				(element) => element.offsetParent !== null || element === document.activeElement,
			);

		const initial = getFocusable();
		(initial[0] ?? container).focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;
			const focusable = getFocusable();
			if (focusable.length === 0) {
				event.preventDefault();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const activeElement = document.activeElement as HTMLElement | null;
			if (event.shiftKey && activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		container.addEventListener("keydown", onKeyDown);
		return () => {
			container.removeEventListener("keydown", onKeyDown);
			previouslyFocused?.focus?.();
		};
	}, [active, containerRef]);
}
