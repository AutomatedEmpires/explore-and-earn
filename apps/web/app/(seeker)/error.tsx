"use client";

import { Icon } from "@explore-and-earn/ui";

import styles from "./status.module.css";

/**
 * Seeker-scope error boundary. Catches render/runtime errors thrown by any
 * (seeker) route segment and offers a recovery action instead of a blank
 * screen. Must be a Client Component per Next.js error-boundary contract.
 */
export default function SeekerError({
	error,
	reset,
}: {
	readonly error: Error & { readonly digest?: string };
	readonly reset: () => void;
}) {
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
