import type { ReactNode } from "react";

import { GlobalHeader } from "../../components/global";
import { PublicBottomNav } from "../../components/public/PublicBottomNav";
import { LegalPageNav } from "./LegalPageNav";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
	return (
		<div className={styles.frame}>
			{/* One unified public header — guest mode (no scope pill applies on legal/about). */}
			<GlobalHeader scope="guest" isAuthenticated={false} />
			<main className={styles.main}>
				{children}
			</main>
			<LegalPageNav />
			<PublicBottomNav />
		</div>
	);
}
