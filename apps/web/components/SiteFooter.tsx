import Link from "next/link";

import styles from "./SiteFooter.module.css";

/**
 * Minimal global footer. The app had no shared footer, so this provides the
 * required legal links site-wide from the root layout.
 */
export function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<span>© 2025 Automated Empires</span>
			<span className={styles.sep} aria-hidden="true">
				·
			</span>
			<Link className={styles.link} href="/terms">
				Terms
			</Link>
			<span className={styles.sep} aria-hidden="true">
				·
			</span>
			<Link className={styles.link} href="/privacy">
				Privacy
			</Link>
			<span className={styles.sep} aria-hidden="true">
				·
			</span>
			<Link className={styles.link} href="/about">
				About
			</Link>
		</footer>
	);
}
