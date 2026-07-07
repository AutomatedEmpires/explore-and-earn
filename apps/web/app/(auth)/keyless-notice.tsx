import Link from "next/link";

import styles from "./auth.module.css";

/**
 * Rendered on /sign-in and /sign-up when Clerk has no publishable key (the
 * keyless local/QA world — the root layout skips <ClerkProvider> there, so
 * Clerk's <SignIn>/<SignUp> would crash to the error boundary). Deployed
 * environments always have keys (middleware.ts throws at build otherwise),
 * so this never renders in production or preview.
 */
export function isClerkKeyless(): boolean {
	return !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

export function KeylessAuthNotice() {
	return (
		<div className={styles.keylessNotice} role="status">
			<p className={styles.keylessTitle}>Sign-in is off in this environment</p>
			<p className={styles.keylessBody}>
				This local build is running without auth keys, so accounts are
				unavailable. Everything public still works.
			</p>
			<Link className={styles.keylessLink} href="/seek">
				Keep exploring jobs
			</Link>
		</div>
	);
}
