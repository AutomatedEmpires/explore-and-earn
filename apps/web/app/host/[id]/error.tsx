"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { reportError } from "../../../lib/sentry";
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
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "host-profile" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We couldn&apos;t load this host profile. Try again or browse other
				opportunities.
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
