import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { cloudinaryPhoto, Icon } from "@explore-and-earn/ui";

import {
	CATEGORY_LANDING,
	LANDING_CATEGORIES,
	categoryLandingPath,
} from "../../../lib/categoryLanding";
import { generateBreadcrumbJsonLd } from "../../../lib/seo";
import styles from "./jobs.module.css";

// Static content (founder lane copy only — no request data, no counts); a
// long revalidate keeps it aligned with deploys without per-request work.
export const revalidate = 3600;

export const metadata: Metadata = {
	// The root template appends "| Explore & Earn" — don't bake it in twice.
	title: "Browse seasonal jobs by category",
	description:
		"Farm, maritime, remote, and seasonal work — every listing answers the three questions that matter before you apply: where you'll sleep, what you'll eat, and what you'll earn.",
	alternates: { canonical: "/jobs" },
	robots: { index: true, follow: true },
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

/**
 * /jobs — the category hub. Four tiles, one per founder-locked lane, each
 * linking its landing page. Copy comes from the categoryLanding contract
 * (founder-approved labels + blurbs); no counts here — the landing pages show
 * real live counts.
 */
export default function JobsHubPage() {
	const breadcrumbJsonLd = generateBreadcrumbJsonLd([
		{ name: "Explore & Earn", url: SITE_URL },
		{ name: "Jobs", url: `${SITE_URL}/jobs` },
	]);

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
			/>
			<div className={styles.page}>
				<header className={styles.hubHeader}>
					<h1 className={styles.hubTitle}>Browse jobs by category</h1>
					<p className={styles.hubSub}>
						Pick a lane — every listing answers Housing, Meals &amp; Pay before
						you apply.
					</p>
				</header>
				<ul className={styles.laneGrid} role="list">
					{LANDING_CATEGORIES.map((category) => {
						const copy = CATEGORY_LANDING[category];
						return (
							<li key={category} className={styles.laneItem}>
								<Link
									className={styles.laneCard}
									data-category={category}
									href={categoryLandingPath(category)}
								>
									<Image
										className={styles.laneImage}
										src={cloudinaryPhoto(category, copy.heroSlug, "card")}
										alt=""
										aria-hidden
										fill
										sizes="(max-width: 768px) 100vw, 50vw"
									/>
									<span className={styles.laneScrim} aria-hidden />
									<span className={styles.laneBody}>
										<span className={styles.laneLabel}>
											<Icon name={`category.${category}`} size={18} aria-hidden />
											{copy.label}
										</span>
										<span className={styles.laneBlurb}>{copy.blurb}</span>
									</span>
									<Icon name="action.forward" size={18} aria-hidden />
								</Link>
							</li>
						);
					})}
				</ul>
			</div>
		</>
	);
}
