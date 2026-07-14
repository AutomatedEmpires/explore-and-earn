"use client";

import { Icon } from "@explore-and-earn/ui";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { reportError } from "../../../lib/sentry";
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
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "host-onboard" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<Icon name="system.error" size={24} aria-hidden />
			<h1 className={styles.heading}>Couldn&apos;t complete setup</h1>
			<p className={styles.message}>
				Something went wrong during host onboarding. Try again or contact support.
			</p>
			{eventId ? (
				<p className={styles.digest}>
					Error ID: {eventId} — quote this if contacting support
				</p>
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
