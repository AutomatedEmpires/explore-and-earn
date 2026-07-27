"use client";

import { useEffect, useState, type ReactNode } from "react";
import type posthogType from "posthog-js";

import { registerAnalyticsClient } from "../lib/analytics";
import { resolvePostHogConfig } from "../lib/posthogConfig";

const posthogConfig = resolvePostHogConfig(
	process.env.NEXT_PUBLIC_POSTHOG_KEY,
	process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * PostHog is deferred off the critical path: the static import shipped
 * ~200 kB min into EVERY route's first load to initialize an analytics
 * client that starts opted-out anyway. The SDK now loads at idle, after
 * hydration, and wires itself up identically.
 */
export function Providers({ children }: { children: ReactNode }) {
	const [, setClient] = useState<typeof posthogType | null>(null);

	useEffect(() => {
		if (!posthogConfig) return;
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
				posthog.init(posthogConfig.key, {
					api_host: posthogConfig.host,
					capture_pageview: "history_change",
					opt_out_capturing_by_default: !accepted,
					// Product analytics is consent-gated above. Replay and console capture
					// remain disabled so form content and application logs never leave the
					// browser through the analytics transport.
					disable_session_recording: true,
					enable_recording_console_log: false,
				});
				setClient(posthog);
				// Hand the initialised instance to the event seam so anything
				// captured while the SDK was still loading is flushed in order
				// (lib/analytics.ts). Consent is unchanged: the instance above is
				// opted out until the banner says otherwise, and capture on an
				// opted-out instance sends nothing.
				registerAnalyticsClient(posthog);
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
