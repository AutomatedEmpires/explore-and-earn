"use client";

import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import styles from "../(host)/status.module.css";

/**
 * Error boundary for the host onboarding flow. If onboarding fails, direct the
 * host to retry rather than leaving them stranded at a blank screen.
 */
export default function OnboardingError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
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
			<Link className={styles.action} href="/" style={{ marginTop: 0 }}>
				Go home
			</Link>
		</section>
	);
}
