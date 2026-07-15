"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Icon } from "@explore-and-earn/ui";

import styles from "./PwaProvider.module.css";

const DISMISS_KEY = "ee-pwa-install-dismissed";

/**
 * BeforeInstallPromptEvent isn't in the DOM lib yet — narrow it locally.
 */
interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	prompt: () => Promise<void>;
	readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA runtime, mounted once in the root layout.
 *
 * 1. Registers the service worker (`/sw.js`) client-side AFTER load — and ONLY
 *    in production, so it never fights the dev HMR socket (Turbopack or
 *    webpack). The SW itself is conservative: GET-only, authed/mutation routes
 *    are never cached (see public/sw.js).
 * 2. Renders a subtle, dismissible "Install app" affordance driven by the
 *    `beforeinstallprompt` event — shown only when the browser says the app is
 *    installable, the user hasn't dismissed it, and it isn't already installed.
 */
export function PwaProvider() {
	const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
	const [installVisible, setInstallVisible] = useState(false);

	// ── Service worker registration (production only, after load) ──────────
	useEffect(() => {
		if (process.env.NODE_ENV !== "production") return;
		if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
			return;
		}

		let cancelled = false;
		const register = () => {
			if (cancelled) return;
			navigator.serviceWorker
				.register("/sw.js", { scope: "/" })
				.then((reg) => {
					// Activate an updated worker as soon as it's installed.
					reg.addEventListener("updatefound", () => {
						const next = reg.installing;
						if (!next) return;
						next.addEventListener("statechange", () => {
							if (
								next.state === "installed" &&
								navigator.serviceWorker.controller
							) {
								next.postMessage("SKIP_WAITING");
							}
						});
					});
				})
				.catch(() => {
					// Registration failures are non-fatal — the app works without the SW.
				});
		};

		if (document.readyState === "complete") {
			register();
		} else {
			window.addEventListener("load", register, { once: true });
		}
		return () => {
			cancelled = true;
			window.removeEventListener("load", register);
		};
	}, []);

	// ── Install affordance ────────────────────────────────────────────────
	useEffect(() => {
		const isStandalone =
			window.matchMedia?.("(display-mode: standalone)").matches ||
			// iOS Safari legacy flag
			(navigator as unknown as { standalone?: boolean }).standalone === true;
		if (isStandalone) return;

		let dismissed = false;
		try {
			dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
		} catch {
			dismissed = false;
		}

		const onBeforeInstall = (event: Event) => {
			// Suppress Chrome's default mini-infobar; we present our own affordance.
			event.preventDefault();
			deferredPrompt.current = event as BeforeInstallPromptEvent;
			if (!dismissed) setInstallVisible(true);
		};

		const onInstalled = () => {
			deferredPrompt.current = null;
			setInstallVisible(false);
		};

		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		window.addEventListener("appinstalled", onInstalled);
		return () => {
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
			window.removeEventListener("appinstalled", onInstalled);
		};
	}, []);

	function remember() {
		try {
			window.localStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// storage unavailable — dismissal applies for this session only
		}
	}

	async function install() {
		const prompt = deferredPrompt.current;
		if (!prompt) {
			setInstallVisible(false);
			return;
		}
		await prompt.prompt();
		await prompt.userChoice.catch(() => undefined);
		deferredPrompt.current = null;
		setInstallVisible(false);
		remember();
	}

	function dismiss() {
		setInstallVisible(false);
		remember();
	}

	if (!installVisible) return null;

	return (
		<div
			className={styles.prompt}
			role="dialog"
			aria-live="polite"
			aria-label="Install Explore & Earn"
		>
			<span className={styles.mark} aria-hidden>
				<Icon name="action.download" size={22} />
			</span>
			<div className={styles.copy}>
				<span className={styles.title}>Install Explore &amp; Earn</span>
				<span className={styles.sub}>
					Add it to your home screen for a full-screen, offline-ready app.
				</span>
			</div>
			<div className={styles.actions}>
				<Button variant="primary" onClick={install}>
					Install
				</Button>
				<button
					type="button"
					className={styles.dismiss}
					onClick={dismiss}
					aria-label="Not now"
				>
					<Icon name="action.close" size={18} aria-hidden />
				</button>
			</div>
		</div>
	);
}
