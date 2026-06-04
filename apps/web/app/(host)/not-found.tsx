import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import styles from "./status.module.css";

/**
 * Host-scope 404. Shown when a (host) route or resource cannot be found.
 * Routes the host back to the dashboard rather than a dead end.
 */
export default function HostNotFound() {
	return (
		<section className={styles.wrap}>
			<Icon name="nav.dashboard" size={24} aria-hidden />
			<h1 className={styles.heading}>Page not found</h1>
			<p className={styles.message}>
				This page does not exist or may have moved.
			</p>
			<Link className={styles.action} href="/host">
				Back to dashboard
			</Link>
		</section>
	);
}
