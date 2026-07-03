import type { ReactNode } from "react";

import { GlobalHeader } from "../../components/global";
import { PublicBottomNav } from "../../components/public/PublicBottomNav";
import styles from "./blog.module.css";

export default function BlogLayout({ children }: { children: ReactNode }) {
	return (
		<div className={styles.frame}>
			{/* One unified public header — guest mode (the field guide is fully public). */}
			<GlobalHeader scope="guest" isAuthenticated={false} />
			<main className={styles.main}>
				{children}
			</main>
			<PublicBottomNav />
		</div>
	);
}
