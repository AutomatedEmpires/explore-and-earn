"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import styles from "../../status.module.css";

/**
 * Error boundary for the listing detail route. If a listing fails to load,
 * offer a retry and a path back to discovery rather than a blank page. Reports
 * to Sentry on mount.
 */
export default function ListingDetailError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error, {
			tags: { route: "listing-detail" },
			extra: { digest: error.digest },
		});
	}, [error]);

	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Couldn&apos;t load this listing</h1>
			<p className={styles.message}>
				Something went wrong fetching this opportunity. Try again or browse others.
			</p>
			{error.digest ? (
				<p className={styles.digest}>Reference: {error.digest}</p>
			) : null}
			<button type="button" className={styles.action} onClick={() => reset()}>
				Try again
			</button>
			<Link className={styles.action} href="/seek">
				Browse listings
			</Link>
		</section>
	);
}
