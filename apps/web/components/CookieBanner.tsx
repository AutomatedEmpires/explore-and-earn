"use client";

import { useEffect, useState } from "react";

import { Button } from "@explore-and-earn/ui";

import styles from "./CookieBanner.module.css";

const CONSENT_KEY = "cookie_consent";

type Consent = "accepted" | "essential";

/**
 * Cookie consent banner.
 *
 * Shows once, on first visit, to anyone who hasn’t made a choice. “Accept
 * analytics” opts the visitor into PostHog capture; “Essential only” opts them
 * out via posthog.opt_out_capturing(). The choice is persisted in localStorage
 * ("cookie_consent") so the banner never reappears for someone who has chosen.
 */
export function CookieBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(CONSENT_KEY);
			if (stored !== "accepted" && stored !== "essential") {
				setVisible(true);
			}
		} catch {
			// localStorage may be unavailable (private mode); show the banner.
			setVisible(true);
		}
	}, []);

	function choose(consent: Consent) {
		try {
			window.localStorage.setItem(CONSENT_KEY, consent);
		} catch {
			// Ignore storage failures — the choice still applies for this session.
		}

		// Dynamic import on purpose — a static one would weld the ~200 kB SDK
		// into every route's first load just to flip this toggle. Providers
		// also reads the stored choice at init, so the toggle here is a
		// same-session convenience, not the source of truth.
		void import("posthog-js").then(({ default: posthog }) => {
			if (consent === "accepted") {
				posthog.opt_in_capturing();
			} else {
				posthog.opt_out_capturing();
			}
		});

		setVisible(false);
	}

	if (!visible) {
		return null;
	}

	return (
		<div
			className={styles.banner}
			role="dialog"
			aria-live="polite"
			aria-label="Cookie consent"
		>
			<p className={styles.copy}>
				We use essential cookies to keep you signed in, and optional analytics
				cookies to understand how Explore & Earn is used. You choose.{" "}
				<a className={styles.link} href="/cookies">
					Cookie Policy
				</a>
			</p>
			<div className={styles.actions}>
				<Button variant="secondary" onClick={() => choose("essential")}>
					Essential only
				</Button>
				<Button variant="primary" onClick={() => choose("accepted")}>
					Accept analytics
				</Button>
			</div>
		</div>
	);
}
