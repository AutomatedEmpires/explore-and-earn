import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

import styles from "../../auth.module.css";
import { clerkAppearance } from "../../clerk-appearance";
import { KeylessAuthNotice, isClerkKeyless } from "../../keyless-notice";

export const metadata: Metadata = { title: "Join" };

export default function SignUpPage() {
	return (
		<main className={styles.authPage}>
			<div className={styles.authInner}>
				<Link href="/" className={styles.brand} aria-label="Explore and Earn — home">
					Explore<span className={styles.brandAmp}>&amp;</span>Earn
				</Link>
				<p className={styles.tagline}>Start exploring — housing, meals, and pay upfront.</p>
				{isClerkKeyless() ? <KeylessAuthNotice /> : <SignUp appearance={clerkAppearance} />}
			</div>
		</main>
	);
}
