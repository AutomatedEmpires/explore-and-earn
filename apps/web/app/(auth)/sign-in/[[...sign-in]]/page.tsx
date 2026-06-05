import { SignIn } from "@clerk/nextjs";

import styles from "../../auth.module.css";

export default function SignInPage() {
	return (
		<main className={styles.authPage}>
			<SignIn />
		</main>
	);
}
