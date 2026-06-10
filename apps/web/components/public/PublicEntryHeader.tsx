import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import styles from "./PublicEntryHeader.module.css";

export function PublicEntryHeader() {
	return (
		<header className={styles.header}>
			<div className={styles.brandGroup}>
				<Link className={styles.brand} href="/" aria-label="Explore and Earn home">
					<span className={styles.brandSeal} aria-hidden>
						<Icon name="category.mix" size={20} aria-hidden />
					</span>
					<span className={styles.brandWordmark}>
						<span className={styles.brandMark}>Explore</span>
						<span className={styles.brandMarkAccent}>&amp;Earn</span>
					</span>
				</Link>
				<span className={styles.scopePill}>Seeker</span>
			</div>

			<nav className={styles.sectionNav} aria-label="Primary sections">
				<Link className={`${styles.sectionLink} ${styles.sectionLinkActive}`} href="/">
					Explore
				</Link>
				<Link className={styles.sectionLink} href="/community">
					Community
				</Link>
			</nav>

			<nav className={styles.authNav} aria-label="Authentication">
				<Link className={styles.secondaryLink} href="/sign-up">
					Sign up
				</Link>
				<Link className={styles.primaryLink} href="/sign-in">
					Sign in
				</Link>
			</nav>
		</header>
	);
}