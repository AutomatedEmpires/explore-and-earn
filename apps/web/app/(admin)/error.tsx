"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import styles from "../status.module.css";

/**
 * Admin-scope error boundary. Catches render/runtime errors thrown by any
 * (admin) route segment and offers recovery without unmounting the root
 * layout. Reports to Sentry on mount. Client Component per the Next.js
 * error-boundary contract.
 */
export default function AdminError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error, {
			tags: { route: "admin" },
			extra: { digest: error.digest },
		});
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We hit a snag loading this page. Try again or head back to the homepage.
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
