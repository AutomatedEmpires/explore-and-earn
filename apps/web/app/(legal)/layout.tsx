import type { ReactNode } from "react";

import { PublicEntryHeader } from "../../components/public/PublicEntryHeader";
import { PublicBottomNav } from "../../components/public/PublicBottomNav";
import { LegalPageNav } from "./LegalPageNav";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
	return (
		<div className={styles.frame}>
			<PublicEntryHeader />
			<main className={styles.main}>
				{children}
			</main>
			<LegalPageNav />
			<PublicBottomNav />
		</div>
	);
}
