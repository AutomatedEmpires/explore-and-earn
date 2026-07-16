import { Icon } from "@explore-and-earn/ui";

import styles from "./legal.module.css";

/**
 * Non-dismissible notice rendered at the top of legal DRAFTS (Terms, Cookies,
 * Refunds). These pages are sensible starter drafts, not counsel-reviewed final
 * text — this banner makes that unmistakable and cannot be closed.
 */
export function DraftBanner() {
	return (
		<div className={styles.draftBanner} role="note" aria-label="Draft document notice">
			<span className={styles.draftBannerIcon}>
				<Icon name="system.warning" size={18} aria-hidden />
			</span>
			<div className={styles.draftBannerBody}>
				<p className={styles.draftBannerTitle}>Draft — review with legal counsel before launch.</p>
				<p className={styles.draftBannerText}>
					This is a starter draft for internal review, not final or legally binding terms.
					It has not been reviewed by an attorney and may not reflect the laws that apply to you.
				</p>
			</div>
		</div>
	);
}
