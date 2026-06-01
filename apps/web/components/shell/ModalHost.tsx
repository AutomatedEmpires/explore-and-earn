"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { overlayRegistry } from "./overlays";
import { useOverlay, type OpenOverlay } from "./OverlayProvider";
import { useFocusTrap } from "./useFocusTrap";
import { useScrollLock } from "./useScrollLock";

// ModalHost — the single outlet that renders open overlays via a portal.
// Source of truth: docs/ux/modal-sheet-system.md.
//
// Renders nothing until a surface opens an overlay through useOverlay(). Handles
// the cross-cutting shell behaviors: scrim, focus trap, Escape-to-close, body
// scroll lock, and Interaction Preservation (scroll restore on close). Per-
// overlay form factor + family come from the typed overlay registry.

export function ModalHost(): ReactNode {
	const { stack, close } = useOverlay();
	const [mounted, setMounted] = useState(false);
	const hasOverlay = stack.length > 0;

	useEffect(() => {
		setMounted(true);
	}, []);

	useScrollLock(hasOverlay);

	useEffect(() => {
		if (!hasOverlay) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") close();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [hasOverlay, close]);

	if (!mounted || !hasOverlay) return null;

	return createPortal(
		<div className="ee-overlay-root" data-shell="overlay-root">
			{stack.map((overlay, index) => (
				<OverlayLayer
					key={overlay.id}
					overlay={overlay}
					isTop={index === stack.length - 1}
					onClose={() => close(overlay.id)}
				/>
			))}
		</div>,
		document.body,
	);
}

function OverlayLayer({
	overlay,
	isTop,
	onClose,
}: {
	overlay: OpenOverlay;
	isTop: boolean;
	onClose: () => void;
}): ReactNode {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const descriptor = overlayRegistry[overlay.key];
	useFocusTrap(containerRef, isTop);

	return (
		<div
			className="ee-overlay"
			data-overlay-key={overlay.key}
			data-family={descriptor.family}
			data-form-mobile={descriptor.mobile}
			data-form-desktop={descriptor.desktop}
			data-top={isTop ? "true" : "false"}
		>
			<button
				type="button"
				className="ee-overlay__scrim"
				aria-label="Close overlay"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div
				className="ee-overlay__container"
				role="dialog"
				aria-modal="true"
				aria-label={overlay.key}
				ref={containerRef}
			>
				{overlay.render({ close: onClose })}
			</div>
		</div>
	);
}
