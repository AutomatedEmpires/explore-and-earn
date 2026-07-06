"use client";

import { useEffect, useState, type ReactNode } from "react";
import type posthogType from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

/**
 * PostHog is deferred off the critical path: the static import shipped
 * ~200 kB min into EVERY route's first load to initialize an analytics
 * client that starts opted-out anyway. The SDK now loads at idle, after
 * hydration, and wires itself up identically.
 */
export function Providers({ children }: { children: ReactNode }) {
	const [, setClient] = useState<typeof posthogType | null>(null);

	useEffect(() => {
		if (!posthogKey) return;
		const load = () =>
			import("posthog-js").then(({ default: posthog }) => {
				// Honor the persisted cookie-banner choice at init — the banner's
				// own toggle is only a same-session convenience.
				let accepted = false;
				try {
					accepted = window.localStorage.getItem("cookie_consent") === "accepted";
				} catch {
					// Private mode — stay opted out.
				}
				posthog.init(posthogKey, {
					api_host: posthogHost,
					capture_pageview: "history_change",
					opt_out_capturing_by_default: !accepted,
				});
				setClient(posthog);
			});
		if (typeof window.requestIdleCallback === "function") {
			const id = window.requestIdleCallback(() => void load());
			return () => window.cancelIdleCallback(id);
		}
		const t = setTimeout(() => void load(), 1500);
		return () => clearTimeout(t);
	}, []);

	return <>{children}</>;
}
