"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import styles from "../../status.module.css";

/**
 * Error boundary for public host profile pages (/host/[id]). Offers recovery
 * without unmounting the root layout. Reports to Sentry on mount.
 */
export default function HostProfileError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error, {
			tags: { route: "host-profile" },
			extra: { digest: error.digest },
		});
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We couldn&apos;t load this host profile. Try again or browse other
				opportunities.
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
