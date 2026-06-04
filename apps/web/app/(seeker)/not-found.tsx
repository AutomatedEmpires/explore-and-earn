import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import styles from "./status.module.css";

/**
 * Seeker-scope 404. Shown when a (seeker) route or resource cannot be found.
 * Routes the seeker back to the Seek tab rather than a dead end.
 */
export default function SeekerNotFound() {
	return (
		<section className={styles.wrap}>
			<Icon name="nav.seek" size={24} aria-hidden />
			<h1 className={styles.heading}>Page not found</h1>
			<p className={styles.message}>
				This page does not exist or may have moved.
			</p>
			<Link className={styles.action} href="/seek">
				Back to Seek
			</Link>
		</section>
	);
}
