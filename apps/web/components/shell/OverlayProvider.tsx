"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

import type { OverlayKey } from "./overlays";

// OverlayProvider — the app-shell's overlay router (WI-FE-01).
// Source of truth: docs/ux/modal-sheet-system.md (Notion: Popup / Modal Families).
//
// This is foundational infrastructure only. The shell registers NO feature
// overlays; surfaces call `useOverlay().open(key, render)` to mount their own
// content into the shared host. The form factor (modal/sheet/drawer/popover/
// fullscreen) is resolved from the typed overlay registry in `overlays.ts`.

export type OverlayControls = { close: () => void };

export type OpenOverlay = {
	id: number;
	key: OverlayKey;
	render: (controls: OverlayControls) => ReactNode;
};

type OverlayContextValue = {
	stack: readonly OpenOverlay[];
	open: (key: OverlayKey, render: (controls: OverlayControls) => ReactNode) => number;
	close: (id?: number) => void;
	closeAll: () => void;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function useOverlay(): OverlayContextValue {
	const ctx = useContext(OverlayContext);
	if (!ctx) {
		throw new Error("useOverlay must be used within an OverlayProvider");
	}
	return ctx;
}

export function OverlayProvider({ children }: { children: ReactNode }): ReactNode {
	const [stack, setStack] = useState<readonly OpenOverlay[]>([]);
	const idRef = useRef(0);

	const open = useCallback<OverlayContextValue["open"]>((key, render) => {
		idRef.current += 1;
		const id = idRef.current;
		setStack((prev) => [...prev, { id, key, render }]);
		return id;
	}, []);

	const close = useCallback<OverlayContextValue["close"]>((id) => {
		setStack((prev) =>
			id === undefined ? prev.slice(0, -1) : prev.filter((overlay) => overlay.id !== id),
		);
	}, []);

	const closeAll = useCallback(() => setStack([]), []);

	const value = useMemo<OverlayContextValue>(
		() => ({ stack, open, close, closeAll }),
		[stack, open, close, closeAll],
	);

	return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}
