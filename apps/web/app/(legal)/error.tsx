"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import styles from "../status.module.css";

/**
 * Error boundary for the (legal) route group (terms, privacy, cookies, about).
 * Offers recovery without unmounting the root layout. Reports to Sentry on
 * mount.
 */
export default function LegalError({
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
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We couldn&apos;t load this page. Try again or head back to the homepage.
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
