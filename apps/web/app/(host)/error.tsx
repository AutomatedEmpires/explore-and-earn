"use client";

import { Icon } from "@explore-and-earn/ui";
import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

import { reportError } from "../../lib/sentry";
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
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "host" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<Icon name="system.error" size={24} aria-hidden />
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We hit a snag loading this page. You can try again.
			</p>
			{eventId ? (
				<p className={styles.digest}>
					Error ID: {eventId} — quote this if contacting support
				</p>
			) : null}
			<button type="button" className={styles.action} onClick={() => reset()}>
				Try again
			</button>
		</section>
	);
}
