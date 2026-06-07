import type { ReactNode } from "react";
import Link from "next/link";

import styles from "./legal.module.css";

/**
 * Shared chrome for the legal/compliance pages (/terms, /privacy, /cookies,
 * /about). A single readable column with a back-to-home link. Renders inside
 * the root layout, so it inherits global styles, the site footer, and the
 * cookie banner.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
	return (
		<div className={styles.page}>
			<div className={styles.container}>
				<Link href="/" className={styles.backLink}>
					← Back to home
				</Link>
				<article className={styles.prose}>{children}</article>
			</div>
		</div>
	);
}
