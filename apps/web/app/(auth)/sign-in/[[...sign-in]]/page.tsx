import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

import styles from "../../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
	return (
		<main className={styles.authPage}>
			<SignIn />
		</main>
	);
}
