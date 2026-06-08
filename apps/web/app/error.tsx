"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { reportError } from "../lib/sentry";
import styles from "./status.module.css";

/**
 * Root error boundary. Catches unhandled errors from public routes (/, /listing,
 * /search) and offers recovery. Must be a Client Component per Next.js contract.
 */
export default function RootError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	const [eventId, setEventId] = useState<string | undefined>(undefined);

	useEffect(() => {
		reportError(error, { route: "root" });
		setEventId(Sentry.lastEventId());
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We hit a snag. Try reloading or head back to the homepage.
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
