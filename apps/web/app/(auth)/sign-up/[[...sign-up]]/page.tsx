import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import styles from "../../auth.module.css";

export const metadata: Metadata = { title: "Join" };

export default function SignUpPage() {
	return (
		<main className={styles.authPage}>
			<SignUp />
		</main>
	);
}
