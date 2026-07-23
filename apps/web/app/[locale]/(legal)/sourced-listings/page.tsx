import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import styles from "../legal.module.css";

export const dynamic = "force-static";

const TAKEDOWN_EMAIL = "jackson@automatedempires.com";

export function generateMetadata(): Metadata {
	return {
		title: "About sourced listings",
		description:
			"What a 'Sourced' listing on Explore & Earn means: real public postings we found and attribute — never confirmed by us, never embellished, and removable on request.",
		alternates: { canonical: "/sourced-listings" },
	};
}

/**
 * The public plain-language explanation of sourced listings + the takedown
 * contact — required by the sourcing compliance policy (§6: "A public 'About
 * sourced listings' page … and the takedown contact should be linked from the
 * disclosure band before go-live"). Shipped in the 2026-07-23 activation wave;
 * linked from every SourcedNotice disclosure band.
 */
export default function SourcedListingsPage() {
	return (
		<>
			<div className={styles.hero}>
				<span className={styles.heroIcon}>
					<Icon name="system.info" size={24} aria-hidden />
				</span>
				<h1 className={styles.heroTitle}>About sourced listings</h1>
				<p className={styles.heroSub}>
					Some listings on Explore &amp; Earn are marked{" "}
					<strong>&ldquo;Sourced&rdquo;</strong>. Here is exactly what that
					means — and what it doesn&apos;t.
				</p>
			</div>

			<section className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="system.info" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>What &ldquo;Sourced&rdquo; means</h2>
				</div>
				<p className={styles.body}>
					A sourced listing is a <strong>real, public job posting</strong> we
					found from a permitted public source — for example, a government job
					board. We show the facts the posting itself stated, name the source,
					and link to the original posting.
				</p>
				<p className={styles.body}>
					<strong>Explore &amp; Earn has not confirmed</strong> the employer or
					the details of a sourced listing. There is no host account behind it,
					no verified badge, and no endorsement — the employer&apos;s name is
					shown exactly as the posting stated it.
				</p>
			</section>

			<section className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="benefit.housing" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Our honesty rules</h2>
				</div>
				<p className={styles.body}>
					Anything the original posting didn&apos;t state is shown as{" "}
					<strong>&ldquo;Not stated&rdquo;</strong> — never assumed, never filled
					in, and never silently turned into a &ldquo;no&rdquo;. We extract stated
					facts only; we never copy full posting text, add descriptions, or
					invent housing, meals, or pay details. Every sourced listing shows when
					it was last seen at its source, and listings we can no longer observe
					are closed automatically rather than left up looking current.
				</p>
			</section>

			<section className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="trust.verified_host" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Is this your posting?</h2>
				</div>
				<p className={styles.body}>
					If a sourced listing describes your opportunity, you can{" "}
					<strong>claim it</strong> from the listing page. Claiming routes to our
					review, converts the listing into one you own and control, and unlocks
					the full host toolkit. Claiming is the fastest way to correct any
					detail.
				</p>
			</section>

			<section className={styles.section}>
				<div className={styles.sectionHead}>
					<span className={styles.sectionIcon}>
						<Icon name="action.report" size={16} aria-hidden />
					</span>
					<h2 className={styles.sectionTitle}>Removal &amp; corrections</h2>
				</div>
				<p className={styles.body}>
					If you are the employer (or their representative) and want a sourced
					listing about you <strong>removed or corrected</strong>, email{" "}
					<a className={styles.inlineLink} href={`mailto:${TAKEDOWN_EMAIL}?subject=Sourced%20listing%20removal%20request`}>
						{TAKEDOWN_EMAIL}
					</a>{" "}
					with the listing link. We action valid requests promptly — our target
					is within <strong>72 hours</strong> — and we won&apos;t re-ingest a
					posting you&apos;ve asked us to remove.
				</p>
				<p className={styles.body}>
					Prefer the listing stays up? <Link className={styles.inlineLink} href="/for-hosts">Claim and verify it</Link>{" "}
					instead — that puts you in control of every detail.
				</p>
			</section>
		</>
	);
}
