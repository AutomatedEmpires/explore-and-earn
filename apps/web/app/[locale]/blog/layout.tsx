import type { ReactNode } from "react";

import { PublicShell } from "../../components/public/PublicShell";
import styles from "./blog.module.css";

export default function BlogLayout({ children }: { children: ReactNode }) {
	// One shared public chrome (PublicShell owns header/bottom-nav/clearance);
	// this layout only owns the blog's inner column rhythm.
	return (
		<PublicShell>
			<div className={styles.inner}>{children}</div>
		</PublicShell>
	);
}
