import Link from "next/link";
import type { Metadata } from "next";

import styles from "./status.module.css";

export const metadata: Metadata = {
	title: "Page not found",
};

/**
 * Root 404. Shown when no route matches. Routes visitors back to discovery
 * rather than a dead end.
 */
export default function RootNotFound() {
	return (
		<section className={styles.wrap}>
			<h1 className={styles.heading}>Page not found</h1>
			<p className={styles.message}>
				This page doesn&apos;t exist or may have moved.
			</p>
			<Link className={styles.action} href="/">
				Browse opportunities
			</Link>
		</section>
	);
}
