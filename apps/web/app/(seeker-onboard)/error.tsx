"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import styles from "../status.module.css";

/**
 * Error boundary for the seeker onboarding flow. If onboarding fails, direct
 * the seeker to retry rather than leaving them stranded at a blank screen.
 * Reports to Sentry on mount.
 */
export default function SeekerOnboardingError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Couldn&apos;t complete setup</h1>
			<p className={styles.message}>
				Something went wrong during onboarding. Try again or head back to the
				homepage.
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
