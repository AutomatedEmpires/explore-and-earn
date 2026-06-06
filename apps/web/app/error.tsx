"use client";

import Link from "next/link";

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
	return (
		<section className={styles.wrap} role="alert">
			<h1 className={styles.heading}>Something went wrong</h1>
			<p className={styles.message}>
				We hit a snag. Try reloading or head back to the homepage.
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
