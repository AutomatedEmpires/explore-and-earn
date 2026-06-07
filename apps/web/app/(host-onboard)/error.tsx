"use client";

import { Icon } from "@explore-and-earn/ui";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import styles from "../(host)/status.module.css";

/**
 * Error boundary for the host onboarding flow. If onboarding fails, direct the
 * host to retry rather than leaving them stranded at a blank screen. Reports to
 * Sentry on mount.
 */
export default function OnboardingError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error, {
			tags: { route: "host-onboard" },
			extra: { digest: error.digest },
		});
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<Icon name="system.error" size={24} aria-hidden />
			<h1 className={styles.heading}>Couldn&apos;t complete setup</h1>
			<p className={styles.message}>
				Something went wrong during host onboarding. Try again or contact support.
			</p>
			{error.digest ? (
				<p className={styles.digest}>Reference: {error.digest}</p>
			) : null}
			<button type="button" className={styles.action} onClick={() => reset()}>
				Try again
			</button>
			<Link className={styles.action} href="/">
				Go home
			</Link>
		</section>
	);
}
