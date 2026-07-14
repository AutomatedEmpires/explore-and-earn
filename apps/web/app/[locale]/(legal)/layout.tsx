import type { ReactNode } from "react";

import { PublicShell } from "../../../components/public/PublicShell";
import { LegalPageNav } from "./LegalPageNav";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
	// One shared public chrome (PublicShell owns header/bottom-nav/clearance);
	// this layout owns the narrow reading column + the legal quick-nav FAB.
	return (
		<PublicShell>
			<div className={styles.inner}>{children}</div>
			<LegalPageNav />
		</PublicShell>
	);
}
