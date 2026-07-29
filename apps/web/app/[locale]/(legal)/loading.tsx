import { Skeleton } from "@explore-and-earn/ui";

import styles from "./loading.module.css";

/**
 * Legal/editorial scope loading state (terms, privacy, cookies, refunds,
 * about, faq, credits, sourced-listings).
 *
 * Without this the group fell back to the [locale]-level boundary, whose
 * skeleton is shaped like a discovery grid — a card lattice flashing in front
 * of a terms page, then relaying out into prose. Document-shaped here: a title,
 * a standfirst, then paragraph rules of uneven length so the reveal lands where
 * the text actually is.
 */
const BLOCK_KEYS = ["block-1", "block-2", "block-3", "block-4"];
const LINE_KEYS = ["line-1", "line-2", "line-3", "line-4"];

export default function LegalLoading() {
	return (
		<div className={styles.wrap} role="status" aria-busy="true">
			<div className={styles.title}>
				<Skeleton variant="text" />
			</div>
			<div className={styles.standfirst}>
				<Skeleton variant="text" />
			</div>

			{BLOCK_KEYS.map((block) => (
				<section key={block} className={styles.block}>
					<div className={styles.subhead}>
						<Skeleton variant="text" />
					</div>
					{LINE_KEYS.map((line) => (
						<div key={line} className={styles.line}>
							<Skeleton variant="text" />
						</div>
					))}
				</section>
			))}

			<span className={styles.srOnly}>Loading page</span>
		</div>
	);
}
