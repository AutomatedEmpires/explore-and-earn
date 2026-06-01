"use client";

import { useEffect } from "react";

// useScrollLock — locks body scroll while `active` and preserves the scroll
// position, restoring it on release. This is the Interaction Preservation
// guarantee for overlays: opening a sheet/modal must never lose the user's
// place in the underlying surface (docs/ux/modal-sheet-system.md).

export function useScrollLock(active: boolean): void {
	useEffect(() => {
		if (!active) return;
		const { body } = document;
		const scrollY = window.scrollY;
		const previous = {
			position: body.style.position,
			top: body.style.top,
			width: body.style.width,
			overflow: body.style.overflow,
		};

		body.style.position = "fixed";
		body.style.top = `-${scrollY}px`;
		body.style.width = "100%";
		body.style.overflow = "hidden";

		return () => {
			body.style.position = previous.position;
			body.style.top = previous.top;
			body.style.width = previous.width;
			body.style.overflow = previous.overflow;
			window.scrollTo(0, scrollY);
		};
	}, [active]);
}
