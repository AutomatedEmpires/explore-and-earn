import styles from "./shell.module.css";

/**
 * Brand chrome at the top of the app shell. Server component — purely
 * presentational, no client state.
 */
export function TopBar() {
	return (
		<header className={styles.topBar}>
			<span className={styles.brand}>{"Explore&Earn"}</span>
		</header>
	);
}
