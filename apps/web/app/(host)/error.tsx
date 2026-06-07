"use client";

import { Icon } from "@explore-and-earn/ui";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import styles from "./status.module.css";

/**
 * Host-scope error boundary. Catches render/runtime errors thrown by any
 * (host) route segment and offers a recovery action instead of a blank
 * screen. Must be a Client Component per Next.js error-boundary contract.
 */
export default function HostError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error, {
			tags: { route: "host" },
			extra: { digest: error.digest },
		});
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<Icon name="system.error" size={24} aria-hidden />
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We hit a snag loading this page. You can try again.
			</p>
			{error.digest ? (
				<p className={styles.digest}>Reference: {error.digest}</p>
			) : null}
			<button type="button" className={styles.action} onClick={() => reset()}>
				Try again
			</button>
		</section>
	);
}
